import { type CatppuccinFlavor, flavors } from '@catppuccin/palette';
import plugin from 'tailwindcss/plugin';

import { ACCENTS } from './accents';

function rules(scope: string, flavor: CatppuccinFlavor): [string, Record<string, string>][] {
  // daisyUI's theme selectors outrank any rule on <html>, so override where body inherits.
  return ACCENTS.map(({ id }) => [
    `${scope}[data-accent='${id}'] body`,
    { '--color-primary': flavor.colors[id].hex }
  ]);
}

export default plugin(({ addBase }) => {
  addBase({
    ...Object.fromEntries(rules(':root:not([data-theme])', flavors.latte)),
    '@media (prefers-color-scheme: dark)': Object.fromEntries(
      rules(':root:not([data-theme])', flavors.mocha)
    ),
    ...Object.fromEntries(
      Object.entries(flavors).flatMap(([name, flavor]) => rules(`[data-theme='${name}']`, flavor))
    )
  });
});
