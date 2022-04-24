import {
  addDependenciesToPackageJson,
  addProjectConfiguration,
  convertNxGenerator,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  names,
  offsetFromRoot,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import {GraphqlMeshGeneratorSchema} from './schema';

interface NormalizedSchema extends GraphqlMeshGeneratorSchema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
}

function normalizeOptions(
  tree: Tree,
  options: GraphqlMeshGeneratorSchema
): NormalizedSchema {
  const name = names(options.name).fileName;
  const projectDirectory = options.directory
    ? `${names(options.directory).fileName}/${name}`
    : name;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = `${getWorkspaceLayout(tree).appsDir}/${projectDirectory}`;
  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];

  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
  };
}

function addFiles(tree: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...names(options.name),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    singleMeshFile: options.singleMeshFile,
    template: '',
  };

  generateFiles(
    tree,
    path.join(__dirname, './files'),
    options.projectRoot,
    templateOptions
  );
}

function addMissingDependencies(tree: Tree, options: NormalizedSchema) {
  let dependencies: Record<string, string> = {
    "@graphql-mesh/cli": "0.67.3",
    "@graphql-mesh/json-schema": "0.27.6",
    "@graphql-mesh/transform-mock": "0.14.27",
    "@graphql-mesh/transform-naming-convention": "^0.10.32",
    "graphql": "16.0.1",
    "env-cmd": "^10.1.0",
  }

  if (!options.singleMeshFile) {
    dependencies = {...dependencies, "yamlinc": "0.1.10"}
  }

  return addDependenciesToPackageJson(tree, dependencies, {"@graphql-mesh/cross-helpers": "0.1.0"})
}

function addJestPreset(tree: Tree, options: NormalizedSchema) {
  generateFiles(
    tree,
    path.join(__dirname, './files_root'),
    `${offsetFromRoot(options.projectDirectory)}/proj`,
    {}
  );
}

export async function applicationGenerator(
  tree: Tree,
  options: GraphqlMeshGeneratorSchema
) {
  const normalizedOptions = normalizeOptions(tree, options);
  const installTask = addMissingDependencies(tree, normalizedOptions);

  addProjectConfiguration(tree, normalizedOptions.projectName, {
    root: normalizedOptions.projectRoot,
    projectType: 'application',
    sourceRoot: `${normalizedOptions.projectRoot}/src`,
    targets: {
      build: {
        executor: '@nx-diogo/graphql-mesh:build',
        options: {
          meshYmlPath: `${normalizedOptions.projectRoot}/config`,
          singleMeshFile: options.singleMeshFile
        }
      },
      test: {
        executor: "@nrwl/jest:jest",
        dependsOn: [
          {target: "build", projects: "self"}
        ],
        outputs: [`coverage/${normalizedOptions.projectRoot}`],
        options: {
          jestConfig: `${normalizedOptions.projectRoot}/jest.config.js`,
          passWithNoTests: true
        }
      },
      serve: {
        executor: '@nx-diogo/graphql-mesh:serve',
        options: {
          meshYmlPath: `${normalizedOptions.projectRoot}/config`
        }
      },
      lint: {
        executor: "@nrwl/linter:eslint",
        options: {
          lintFilePatterns: [`${normalizedOptions.projectRoot}/**/*.ts`]
        }
      }
    },
    tags: normalizedOptions.parsedTags,
  });

  addJestPreset(tree, normalizedOptions)

  addFiles(tree, normalizedOptions);
  await formatFiles(tree);

  return () => {
    installTask();
  };
}

export default applicationGenerator;
export const applicationSchematic = convertNxGenerator(applicationGenerator);