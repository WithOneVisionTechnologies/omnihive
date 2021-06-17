#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import meow from "meow";
import CommandLineInterface from "./CommandLineInterface";

meow(
    `
	Usage
	  $ omnihive-cli

	Note
        Running omnihive-cli will bring up an interactive menu.
        At this time there are no command-line switches
`
);

render(<CommandLineInterface />);
