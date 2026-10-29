import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

// Only Handlebars inputs are text; all other template assets retain exact bytes.
export function readTemplateFile(path, render) {
  return extname(path) === '.hbs' ? render(readFileSync(path, 'utf8')) : readFileSync(path);
}

// npm excludes .gitignore from packages, so recipes ship it as gitignore.
export function templateTargetPath(appPath, templateFile) {
  const name = basename(templateFile);
  const renderedName = name.endsWith('.hbs') ? name.slice(0, -4) : name;
  return join(appPath, dirname(templateFile), renderedName === 'gitignore' ? '.gitignore' : renderedName);
}
