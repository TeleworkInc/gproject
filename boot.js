/**
 * @license MIT
 */
/**
 * @fileoverview
 * Install gnvDependencies and peerDependencies. This file cannot use third
 * party modules.
 */

import { readPackageJson } from './package.js';
import { spawnSync } from 'child_process';

const packageJson = readPackageJson();

const gnvDependencies = (
  Object.entries(packageJson.gnvDependencies || {}).map(
      ([key, val]) => `${key}@${val}`,
  )
);
const peerDependencies = (
  Object.entries(packageJson.peerDependencies || {}).map(
      ([key, val]) => `${key}@${val}`,
  )
);

const callNpm = (...args) => spawnSync(
    'npm',
    args,
    {
      stdio: 'inherit',
    },
);

/**
 * Install gnvDependencies in this folder without updating package.json.
 */
if (gnvDependencies.length) {
  console.log('Adding local gnv deps to node_modules/:', '\n');
  console.log(...gnvDependencies, '\n');
  callNpm('i', '--no-save', ...gnvDependencies);
}

/**
 * Globally install all peerDependencies without updating package.json, then
 * link all globally installed peerDeps to make them available in this package.
 */
if (peerDependencies.length) {
  /**
   * Make sure no previous versions of this package are linked in this
   * workspace.
   */
  const anyVersionPeerDeps = Object.keys(packageJson.peerDependencies);

  // console.log(
  //     'Removing any previously linked peerDeps...\n',
  //     ...anyVersionPeerDeps,
  // );
  // callNpm('unlink', ['unlink', '-f', '--no-save', ...anyVersionPeerDeps]);


  /**
   * Install peerDeps globally.
   */
  console.log('Adding global peerDeps:', '\n');
  console.log(...peerDependencies, '\n');
  callNpm('i', '-g', '--no-save', ...peerDependencies);

  /**
   * Link peerDeps locally.
   */
  callNpm('link', '--no-save', ...anyVersionPeerDeps);

  console.log(
      '\nDone! Your development CLI should be ready at `gnv`.\n',
  );
}