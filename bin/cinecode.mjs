#!/usr/bin/env node
// cinecode — storyboard JSON → painted, animated, scored and mixed film.  `cinecode --help` for commands.
import { main } from '../engine/render/cli.mjs';

process.exitCode = await main(process.argv.slice(2));
