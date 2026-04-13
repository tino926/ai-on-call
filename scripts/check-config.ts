#!/usr/bin/env node
import * as fs from 'fs';
import * as toml from 'toml';
import { ConfigValidator } from '../src/utils/config-validator.js';

const args = process.argv.slice(2);
const configFile = args[0];

if (!configFile) {
  console.error('Usage: tsx scripts/check-config.ts <config-file>');
  process.exit(1);
}

if (!fs.existsSync(configFile)) {
  console.error(`Config file not found: ${configFile}`);
  process.exit(1);
}

try {
  console.log('Checking configuration...', configFile);

  const content = fs.readFileSync(configFile, 'utf-8');
  const parsed = toml.parse(content);

  ConfigValidator.validate(parsed);

  console.log('✅ Configuration is valid!');
  console.log('\nConfiguration Summary:');
  console.log(`  - Runtime: ${parsed.runtime?.default || 'claude'}`);
  console.log(`  - Work Dir: ${parsed.runtime?.work_dir || 'current directory'}`);
  console.log(`  - Hook Port: ${parsed.hook?.port || 9876}`);
  console.log(`  - Logging Level: ${parsed.logging?.level || 'info'}`);

  process.exit(0);
} catch (error: any) {
  console.error('❌ Configuration validation failed!');

  if (error.field) {
    console.error(`  Field: ${error.field}`);
    console.error(`  Value: ${error.value}`);
    console.error(`  Constraint: ${error.constraint}`);
  }

  if (error.message) {
    console.error(`  Error: ${error.message}`);
  }

  process.exit(1);
}
