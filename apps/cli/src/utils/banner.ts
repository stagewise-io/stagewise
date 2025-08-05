import chalk from 'chalk';

function displayAsciiLogo(): void {
  // Define the colors for the vertical gradient (from blue to purple).
  // These hex values are chosen to create a smooth transition inspired by the logo.
  const gradientColors = [
    chalk.hex('#4692CF'), // Blue
    chalk.hex('#537CD5'),
    chalk.hex('#6066DA'),
    chalk.hex('#6A4FE0'),
    chalk.hex('#6D28D9'), // Purple
  ];

  // Define the color for the inner part of the logo (the "kernel").
  const kernelColor = chalk.white.bold;

  // The ASCII art for the logo.
  const logo = [
    ' ,adPPYba,  ',
    'a8""###"8a  ',
    '8b,#####bb8 ',
    '"8a,###\\a8" ',
    ' `"YbbdP"   ',
  ];

  const textArt = [
    '     |                                   ',
    ',---.|--- ,---.,---.,---.. . ..,---.,---.',
    "`---.|    ,---||   ||---'| | ||`---.|---'",
    "`---'`---'`---^'---|'---'`-`-'``---'`---' ",
    "               `---'                     ",
  ];

  console.log('');

  // Display logo and text side by side
  for (let i = 0; i < Math.max(logo.length, textArt.length); i++) {
    let line = '';

    // Add the logo part
    if (i < logo.length) {
      const logoLine = logo[i]!;
      const outerColor =
        gradientColors[i] || gradientColors[gradientColors.length - 1]!;
      let coloredLogoLine = '';

      for (const char of logoLine) {
        if (char === '#' || char === '\\') {
          coloredLogoLine += kernelColor(char);
        } else {
          coloredLogoLine += outerColor(char);
        }
      }
      line += `  ${coloredLogoLine}`;
    } else {
      line += `  ${' '.repeat(12)}`; // Maintain spacing when logo is shorter
    }

    // Add spacing between logo and text
    line += '    ';

    // Add the text part
    if (i < textArt.length) {
      const textLine = textArt[i]!;
      // Apply gradient color to text as well
      const textColor = chalk.white.bold;
      // gradientColors[i] || gradientColors[gradientColors.length - 1]!;
      line += textColor(textLine);
    }

    console.log(line);
  }

  console.log('');
}

export function printBanner(silent: boolean): void {
  if (silent) {
    return;
  }

  /**
   * This function logs an ASCII art representation of the logo to the console.
   * It uses chalk to apply a blue and purple gradient, similar to the provided image,
   * with a white-filled center.
   */

  // createAsciiCircle(10, 'W', chalk.blue);
  displayAsciiLogo();
  console.log();
  console.log(chalk.cyan.bold('     STAGEWISE'));
  console.log(
    chalk.gray('     The frontend coding agent for production codebases'),
  );
  console.log();
  console.log();
}

export function printCompactBanner(silent: boolean): void {
  if (silent) {
    return;
  }

  console.log();
  console.log(chalk.cyan.bold('  STAGEWISE'));
  console.log(chalk.gray('  Development Proxy & AI Coding Assistant'));
  console.log();
}
