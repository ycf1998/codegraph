#!/usr/bin/env node

const command = require('./cli/index');

command.parseAsync(process.argv).catch(console.error);
