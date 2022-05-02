import {BuildExecutorSchema} from './schema';
import {promisify} from "util";
import {exec, execSync} from "child_process";
import {copyFileSync, existsSync, mkdirSync, readdirSync, statSync} from "fs"
import {getPackageManagerCommand, logger} from "@nrwl/devkit";
import {replaceTscAliasPaths,} from 'tsc-alias';
import * as path from "path";
import {PackageManagerCommands} from "nx/src/utils/package-manager";

export default async function runExecutor(options: BuildExecutorSchema) {
  const buildCommand = createBuildCommand(options)
  const packageManager = getPackageManagerCommand();

  if (!options.singleMeshFile) {
    constructMeshRcYamlFile(options.meshYmlPath, packageManager);
  }

  if (options.typescriptSupport) {
    await transpileTypescriptFiles(options, packageManager);
    copyNonJavascriptFilesRecursiveSync(options.rootPath, options.outputPath, options.rootPath)
  }

  if (options.singleMeshFile) {
    copyFileSync(`${options.meshYmlPath}/.meshrc.yml`, `dist/${options.meshYmlPath}/.meshrc.yml`);
  }

  return runBuildCommand(buildCommand, options);
}

async function runBuildCommand(buildCommand: string, options: BuildExecutorSchema) {
  const result = await promisify(exec)(buildCommand);

  if (!result.stdout.includes("Done!")) {
    return {
      ...result,
      success: false
    }
  }

  // copy files in order to use in unit tests.
  copyFilesRecursiveSync(`dist/${options.meshYmlPath}`, `${options.rootPath}/.compiled`)

  return {
    ...result,
    success: true,
  };
}

function removeLastOnPath(fullPath: string) {
  const splitted = fullPath.split("/")
  if (splitted.length) {
    splitted.pop();
    fullPath = splitted.join("/")
  }
  return fullPath;
}

function createBuildCommand(options: BuildExecutorSchema) {
  let buildCommand = `mesh build`;

  if (options.typescriptSupport) {
    buildCommand += ` --dir dist/${options.meshYmlPath}`;
  } else {
    buildCommand += ` --dir ${options.meshYmlPath}`;
  }

  if (options.fileType) {
    buildCommand += ` --fileType ${options.fileType}`
  }

  if (options.envFile) {
    buildCommand = `env-cmd ${options.envFile} ${buildCommand}`
  }
  return buildCommand;
}

function constructMeshRcYamlFile(meshYmlPath: string, packageManager: PackageManagerCommands) {
  const yamlincCommand = `${packageManager.exec} --package=yamlinc -c 'yamlinc --output ./dist/${meshYmlPath}/.meshrc.yml ./${meshYmlPath}/.meshrc.yml --strict'`

  try {
    logger.info(` > ${yamlincCommand}`)
    execSync(yamlincCommand, {stdio: [0, 1, 2]})
  } catch (e) {
    logger.error(`Failed to execute command: ${yamlincCommand}`);
    return {
      success: false
    }
  }
}

async function transpileTypescriptFiles(options: BuildExecutorSchema, packageManager: PackageManagerCommands) {
  const tsconfigPath = `${options.tsconfigPath}`;

  //TODO: change this for the typescript compiler API.
  execSync(`${packageManager.exec} --package=typescript -c 'tsc --project ./${tsconfigPath}'`, {stdio: [0, 1, 2]})
  await replaceTscAliasPaths({configFile: tsconfigPath})
}

function copyFilesRecursiveSync(src: string, dest: string) {
  const exists: boolean = existsSync(src);
  const stats = exists && statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!existsSync(dest)) {
      mkdirSync(dest);
    }
    readdirSync(src).forEach((childItemName: string) => {
      copyFilesRecursiveSync(path.join(src, childItemName),
        path.join(dest, childItemName));
    });
  } else {
    copyFileSync(src, dest);
  }
}

function copyNonJavascriptFilesRecursiveSync(src: string, dest: string, rootDir: string) {
  const exists: boolean = existsSync(src);
  const stats = exists && statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!existsSync(dest)) {
      mkdirSync(dest);
    }
    readdirSync(src).forEach((childItemName: string) => {
      copyNonJavascriptFilesRecursiveSync(path.join(src, childItemName),
        path.join(dest, childItemName), rootDir);
    });
  } else {
    // eslint-disable-next-line
    const isJavascriptOrMeshRcFile = src.match("(.*(\.ts|\.js)|\.meshrc\.yml)$");
    const fileOnRootFolder = removeLastOnPath(src) === rootDir;

    if (!isJavascriptOrMeshRcFile && !fileOnRootFolder) {
      copyFileSync(src, dest);
    }
  }
}
