export function parentPath(path: string): string {
  const index = path.search(/[\\/][^\\/]*$/);
  return index === -1 ? '' : path.slice(0, index);
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

export function childPath(path: string, name: string): string {
  return path ? `${path}/${name}` : name;
}
