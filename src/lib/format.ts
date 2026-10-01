export function getInitials(fullName?: string | null): string {
  return (
    fullName
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() ?? '?'
  );
}