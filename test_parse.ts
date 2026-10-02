import fs from 'fs';
import yaml from 'yaml';
import { RelationalSchemaValidator } from './src/validation/WorkflowSchema';
const doc = yaml.parse(fs.readFileSync('./workflows/relational_sample.yaml', 'utf8'));
const res = RelationalSchemaValidator.safeParse(doc);
if (!res.success) console.log(JSON.stringify(res.error.format(), null, 2));
else console.log('success');
