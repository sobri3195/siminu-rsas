export function csvCell(value: string) {
  const safe = /^[\s\uFEFF]*[=+@\-]|^[\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
