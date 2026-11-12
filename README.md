# SFE Heist Hackathon Map

Foundry National Bank is the shared 3D map for the SFE Heist hackathon. It includes the bank and surrounding city block, three floors, doors, stairs, elevator, and the animated vault. The walkthrough is a single canvas. Teams can use the map source as a starting point for their own defenses.

## Walk the map

Use Node.js 20 or newer. The renderer and assets are bundled.

```sh
npm start
```

Open [the local map](http://127.0.0.1:4173). If port 4173 is occupied, run `PORT=4174 npm start` and open port 4174.

| Input | Action |
| --- | --- |
| Click the map | Capture the mouse to look around |
| WASD or arrows | Walk |
| Shift | Sprint |
| E | Operate the door you face or call the lift |
| 1 / 2 / 3 | Travel to B1 / L1 / L2 while inside the lift |
| Escape | Release the mouse |

On B1, exit the back of the lift and approach the round vault. Press **E** facing the door. The handwheel turns and the leaf swings inward.

## Use the source

- [map.js](map.js) exports the map, controller, lighting helpers, and coordinate registry.
- [core/world.js](core/world.js) builds the geometry and provides colliders, walkable surfaces, and door and elevator state.
- [walkthrough.js](walkthrough.js) shows how to create a Three.js scene, attach the map, and update it as the player moves.
- [Room and door registry](ROOMS.md) lists IDs and coordinates. [assets/registry.json](assets/registry.json) contains machine-readable bounds and connections. World units are meters, +Y is up, and +Z points toward the public entrance.

`createWorld(scene)` adds the bank under `world.root`. Run `world.update(dt, elapsed, player)` to animate it. For the built-in controller, pass `world.colliders` and `world.supports`. A custom renderer should enable local clipping for the sliding doors. The built-in controller expects the map at its original coordinates. The map source runs in a browser with WebGL 2.

Run `npm test` to check the layout, movement, doors, elevator, and vault. See [asset credits](assets/SOURCES.md) and the [vendored Three.js license](vendor/THREE-LICENSE.txt).
