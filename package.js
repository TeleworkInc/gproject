/**
 * @license MIT
 */
/**
 * @fileoverview
 * Get package.json object. This is depended on by `boot.js`, and cannot contain
 * any third-party modules.
 */

import path from 'path';
import { spawnSync } from 'child_process';
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'fs';

const spacer = (msg) => console.log(
    '\x1b[96m%s\x1b[0m', `[𝓰𝓷𝓿]` + ` ${msg}`,
);

const getPackageStrings = (deps = {}) => (
  Object.entries(deps).map(
      ([key, val]) => `${key}@${val}`,
  )
);

const callNpm = async (...args) => {
  console.log(`\n> npm ${args.join(' ')}\n`);
  await spawnSync(
      'npm',
      args,
      {
        /**
         * Only inherit stderr.
         */
        stdio: ['ignore', 'ignore', 'inherit'],
      },
  );
};

/**
 * Read the package.json object from the current directory.
 *
 * @param {string} directory
 * The directory to load the package.json from. Defaults to `process.cwd()`.
 *
 * @return {object} package
 * The package.json object.
 */
export const readPackageJson = (directory = process.cwd()) => {
  const fileName = path.resolve(directory, 'package.json');

  return existsSync(fileName)
      ? JSON.parse(readFileSync(fileName))
      : {};
};


/**
 * @param {object} obj The new package.json object to serialize and write.
 *
 * @param {{
 *  directory: string,
 *  spaces: number
 * }} options
 *
 * @return {void}
 */
export const writePackageJson = (obj, {
  directory = process.cwd(),
  spaces = 2,
}) => {
  const fileName = path.resolve(directory, 'package.json');

  if (existsSync(fileName)) {
    writeFileSync(
        fileName,
        JSON.stringify(obj, null, spaces),
    );
  }
};

/**
 * A package string of the form @org/packageName@ver
 *
 * @typedef {string} PackageString
 */
let PackageString;

/**
 * An object containing information about an NPM package.
 *
 * @typedef {{
 *  name: string,
 *  org: string,
 *  version: string,
 * }} PackageInfo
 */
let PackageInfo;

/**
 * Get the package info from a PackageString.
 *
 * @param {PackageString} packageString
 * The PackageString to transform.
 *
 * @return {PackageInfo}
 */
const getPackageInfo = (packageString) => {
  let orgString;
  let version;

  if (packageString[0] === '@') {
    [orgString, packageString] = packageString.split('/');
  }

  [packageString, version] = packageString.split('@');

  /**
   * Add @latest flag if no version present.
   */
  if (!version) version = 'latest';

  return {
    name: packageString,
    org: (orgString || '').substr(1),
    version,
  };
};

/**
 * Using `import.meta.url` to store an absolute reference to this directory.
 * rollup-plugin-import-meta-url will effectively hack around limitations by
 * encoding invalid relative URLs that would not be accepted by
 * `url.fileURLToPath`, such as `file://fileInThisDir` -> `./fileInThisDir`.
 */
export const PACKAGE_ROOT = path.dirname(import.meta.url.substr(7));

/**
 * Export the value of the absolute package.json for easy access.
 */
export const PACKAGE_JSON = readPackageJson(PACKAGE_ROOT);

/**
 * The name of this package.
 */
export const PACKAGE_NAME = PACKAGE_JSON.name || '';

/**
 * Add the given packages to package.json's gnvDependencies field.
 *
 * @param {...PackageString} packageStrings
 * The packages to add.
 *
 * @param {{
 *  peer: boolean,
 * }} options
 * Command metadata.
 */
export const add = async (packageStrings, {
  directory = process.cwd(),
  peer = false,
}) => {
  const packageJson = readPackageJson(directory);
  for (const packageString of packageStrings) {
    const {
      name,
      org,
      version,
    } = getPackageInfo(packageString);

    const pkgString = (
        org
          ? `@${org}/${name}`
          : name
    );

    /**
     * Add to peerDependencies if -P flag set, otherwise add to gnvDependencies.
     */
    (peer
          ? packageJson.peerDependencies
          : packageJson.gnvDependencies
    )[pkgString] = version;

    /**
     * Write to package.json.
     */
    writePackageJson(packageJson, {
      directory,
    });
  }

  /**
   * Print success and start boot.
   */
  console.log('Added', ...packageStrings, 'to package.json.');
  await boot();
};

/**
 * @todo
 * Implement
 */
export const remove = async () => {};

/**
 * Install the dependencies for the package.json in `process.cwd()`. Use `dev`
 * flag to also install dev dependencies.
 *
 * @param {{
 *  dev: boolean,
 *  dir: string,
 * }} options
 * Runtime options.
 */
export const install = async ({
  dev = false,
}) => {
  /**
   * Link this package. This has to be done before everything else due to the
   * weird behavior of npm, which will delete necessary dependencies if this is
   * run after installing peerDeps or gnvDeps.
   */
  spacer('Linking this package to global bin...');
  await callNpm('link', '-f', '--no-save', '--silent');

  /**
   * If not in dev mode, install just the peer deps.
   */
  if (!dev) {
    spacer('Release mode: Installing peer dependencies only.');
    await installGlobalDeps();
  }
  /**
   * Otherwise, install global and local dependencies for the package.json.
   */
  else {
    await installLocalDeps();
    await installGlobalDeps();
  };
};


/**
 * Get ALL dependencies for a package.
 *
 * @param {string} directory
 * The directory to load the package.json from. Defaults to `process.cwd()`.
 */
export const installAllDeps = async (directory = process.cwd()) => {
  /**
   * Install gnvDependencies for the package.json in the parent folder.
   */
  await installLocalDeps(directory);


  /**
   * Install peerDependencies for the package.json in the parent folder, and
   * link into local `node_modules`.
   */
  await installGlobalDeps(directory);
};


/**
 * Install gnvDependencies for a package.json.
 *
 * @param {string} directory
 * The directory to load the package.json from. Defaults to `process.cwd()`.
 *
 * @return {void}
 */
export const installLocalDeps = async (directory = process.cwd()) => {
  const packageJson = readPackageJson(directory);
  const gnvDependencies = getPackageStrings(packageJson.gnvDependencies);

  if (!gnvDependencies.length) {
    return spacer('No gnvDependencies to install.');
  }

  spacer('Adding local gnv deps to node_modules:');
  await callNpm('i', '-f', '--no-save', '--silent', ...gnvDependencies);
  spacer(`Installed ${gnvDependencies.length} packages.`);
};


/**
 * Install peerDependencies for a package.json.
 *
 * @param {string} directory
 * The directory to load the package.json from. Defaults to `process.cwd()`.
 *
 * @return {void}
 */
export const installGlobalDeps = async (directory = process.cwd()) => {
  const packageJson = readPackageJson(directory);
  const peerDependencies = getPackageStrings(packageJson.peerDependencies);

  if (!peerDependencies.length) {
    return spacer('No peerDependencies to install.');
  }

  /**
   * Make sure no previous versions of this package are linked in this
   * workspace.
   */
  const anyVersionPeerDeps = Object.keys(packageJson.peerDependencies);

  /**
   * Install peerDeps globally.
   */
  spacer('Adding global peerDeps:');
  await callNpm('i', '-g', '--no-save', '--silent', ...peerDependencies);
  spacer(`Installed ${peerDependencies.length} packages.`);

  /**
   * Link peerDeps locally. Also links this package so that CLIs are
   * available.
   */
  spacer('Linking peer dependencies locally...');
  await callNpm('link', '-f', '--no-save', '--silent', ...anyVersionPeerDeps);

  /**
   * Everything was successful!
   */
  spacer(
      `Done! Your development CLI should be ready at \`${PACKAGE_NAME}-dev\`.`,
      '\n',
  );
};


/**
 * Get the version of this package as defined in package.json.
 *
 * @return {string} version
 */
export const getVersion = () => readPackageJson(PACKAGE_ROOT).version;

/**
 * Install the global dependencies for this program.
 */
export const getPeerDeps = async () => {
  await commands.installGlobalDeps(PACKAGE_ROOT);
};
