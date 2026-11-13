# SFE Heist Hackathon Map

Foundry National Bank is the shared 3D map for the SFE Heist hackathon. It includes the bank and surrounding city block, three floors, doors, stairs, elevator, and the animated vault. The walkthrough is a single canvas. Teams can use the map source as a starting point for their own defenses.

## Run and open the map

### 1. Install Node.js

Install the LTS version of Node.js, then open a new Terminal on macOS or PowerShell on Windows. Run `node --version` to check that it works. The map requires Node.js 20 or newer and a desktop browser with WebGL 2. [Download Node.js](https://nodejs.org/en/download)

### 2. Download the map and open its folder

1. On GitHub, click **Code → Download ZIP**, then extract the ZIP. The extracted folder is usually named `sfe-heist-hackathon-map-main`. [Download the map ZIP](https://github.com/karamvschool-ai/sfe-heist-hackathon-map/archive/refs/heads/main.zip)
2. Open a terminal in the extracted folder, at the same level as `package.json`. On **macOS**, type `cd` followed by a space in Terminal, drag the extracted folder onto the Terminal window, and press **Enter**. On **Windows**, open the extracted folder in File Explorer, type `powershell` into the address bar, and press **Enter**.

If you already use Git, you can get the same files by cloning the repo.

```sh
git clone https://github.com/karamvschool-ai/sfe-heist-hackathon-map.git
cd sfe-heist-hackathon-map
```

### 3. Start the local server

Run this in the map folder. All dependencies and assets are bundled, so you can skip `npm install`.

```sh
npm start
```

Wait for the terminal to print `SFE Heist map at http://127.0.0.1:4173`. Keep the terminal open while you explore. If PowerShell blocks `npm start`, run `npm.cmd start` or `node tools/serve.mjs` instead.

### 4. Open the map in your browser

Open the address printed in the terminal. You should see the street in front of Foundry National Bank. Click inside the map to look around with the mouse. [Open the map at 127.0.0.1:4173](http://127.0.0.1:4173/)

## Explore the bank

| Input | Action |
| --- | --- |
| Click the map | Capture the mouse to look around |
| WASD or arrows | Walk |
| Shift | Sprint |
| E | Operate the door you face or call the lift |
| 1 / 2 / 3 | Travel to B1 / L1 / L2 while inside the lift |
| Escape | Release the mouse. Click the map to resume. |

1. Walk up to the main doors, face them, and press **E**.
2. Walk around either side of the grand staircase. At the far end of the hall, open the door on your side with **E**.
3. Turn toward the middle of the corridor and follow the center passage to the **LIFT · L1** sign. Step fully into the lift and press **1** for the basement.
4. On **B1**, walk out through the opposite side of the lift. Approach the round **CENTRAL RESERVE** vault, face it, and press **E**. Wait for the handwheel to spin and the door to swing open, then walk inside. Press **2** from inside the lift to return to L1.

When you're done, return to the terminal and press **Ctrl+C** to stop the server.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `node` or `npm` is unrecognized | Install Node.js and reopen the terminal. Run `node --version` again. |
| `package.json` is missing | Change into the extracted or cloned map folder and run `npm start` there. |
| The browser can't connect | Check that the server terminal is still open and use the full `http://127.0.0.1:4173/` address. The map loads its JavaScript modules over HTTP, so use this address when opening it. |
| The server reports `EADDRINUSE` | Port 4173 is busy. On macOS or Linux, run `PORT=4174 npm start`. In PowerShell, run `$env:PORT = '4174'` and then `npm.cmd start`. [Open the map on port 4174](http://127.0.0.1:4174/) |
| The page stays blank | Try a desktop browser with WebGL 2 and hardware acceleration enabled. |

## Use the source

- [map.js](map.js) exports the map, controller, lighting helpers, and coordinate registry.
- [core/world.js](core/world.js) builds the geometry and provides colliders, walkable surfaces, and door and elevator state.
- [walkthrough.js](walkthrough.js) shows how to create a Three.js scene, attach the map, and update it as the player moves.
- [Room and door registry](ROOMS.md) lists IDs and coordinates. [assets/registry.json](assets/registry.json) contains machine-readable bounds and connections. World units are meters, +Y is up, and +Z points toward the public entrance.

`createWorld(scene)` adds the bank under `world.root`. Run `world.update(dt, elapsed, player)` to animate it. For the built-in controller, pass `world.colliders` and `world.supports`. A custom renderer should enable local clipping for the sliding doors. The built-in controller expects the map at its original coordinates. The map source runs in a browser with WebGL 2.

Run `npm test` to check the layout, movement, doors, elevator, and vault. See [asset credits](assets/SOURCES.md) and the [vendored Three.js license](vendor/THREE-LICENSE.txt).
