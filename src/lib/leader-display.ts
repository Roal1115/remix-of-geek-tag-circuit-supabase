// Nombre corto para mostrar: nadie dice "Dracule Mihawk" o "Monkey.D.Luffy" completo,
// todos usan el último nombre ("Mihawk", "Luffy"). Nunca tocamos el dato real, solo el display.
export function shortLeaderName(name: string): string {
  // Algunos base_name usan comillas en vez de espacios como separador, ej. Eustass"Captain"Kid
  const parts = name.split(/[\s."'‘’“”]+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

// set_code normalmente es "EB-02" / "OP-09" (letras-dígitos) y lo mostramos sin guion.
// Pero algunos releases US son fusiones de dos expansiones, ej. "OP14-EB04" (dos códigos
// completos separados por guion) — ahí mostramos solo el primero, que es el set real del leader.
export function setBadge(setCode: string | null | undefined): string | null {
  if (!setCode) return null;
  const [first, ...rest] = setCode.split("-");
  if (rest.length > 0 && /\d/.test(first)) return first.toUpperCase();
  return setCode.replace(/-/g, "").toUpperCase();
}
