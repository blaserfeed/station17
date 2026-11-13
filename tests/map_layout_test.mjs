import assert from 'node:assert/strict';
import { StationCollision } from '../static/collision.js';

const bounds = [-36, 36, -27, 27];
const direction = {x: 0, y: 0, z: -1};
const camera = {x: 27, y: 1.25, z: -16};
const support = {name: 'bench', x: 27, z: -18, width: 3, depth: 1.42, bottom: 0, top: 1.3};
const wall = {name: 'wall', x: 27, z: -17.65, width: 3, depth: .12, bottom: 0, top: 3.8};
const test = (solids, options) => new StationCollision(solids, bounds, .43).cameraLimit(camera, direction, 2, options);

assert(test([support]) < 2, 'The camera still clips against furniture');
assert.equal(test([support], {margin: 0, ignoreAtEnd: .55}), 2, 'An item can be targeted on its support');
assert(test([support, wall], {margin: 0, ignoreAtEnd: .55}) < 2, 'A wall always hides an item');
console.log('PASS camera collision and item line of sight are independent');
