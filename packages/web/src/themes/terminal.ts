import { type CatppuccinFlavor, flavors } from '@catppuccin/palette';
import plugin from 'tailwindcss/plugin';

function variables(flavor: CatppuccinFlavor): Record<string, string> {
  return Object.fromEntries(
    Object.values(flavor.ansiColors).flatMap(({ normal, bright }) => [
      [`--terminal-${normal.code}`, normal.hex],
      [`--terminal-${bright.code}`, bright.hex]
    ])
  );
}

export default plugin(({ addBase }) => {
  addBase({
    ':root': variables(flavors.latte),
    '@media (prefers-color-scheme: dark)': {
      ':root:not([data-theme])': variables(flavors.mocha)
    },
    ...Object.fromEntries(
      Object.entries(flavors).map(([name, flavor]) => [`[data-theme='${name}']`, variables(flavor)])
    )
  });
});
