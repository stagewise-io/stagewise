export const errorPage = (appPort: number) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dev app not reachable</title>
  <link rel="preconnect" href="https://rsms.me/">
  <link rel="stylesheet" href="https://rsms.me/inter/inter.css">
  <style>
  :root {
    --bg-color: #f4f4f5;
    --text-color: #09090b;
    --text-muted-color: #71717a;
  }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #09090b;
        --text-color: #fff;
        --text-muted-color: #d4d4d8;
      }
    }

    body {
      background-color: var(--bg-color);
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      margin: 0px;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: 'Inter', sans-serif;
    }

    #error-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px;
      gap: 4px;
    }

    h1 {
      color: var(--text-color);
      font-size: 24px;
      font-weight: 600;
      margin: 0px;
      text-align:center;
    }

    p {
      color: var(--text-muted-color);
      font-size: 16px;
      font-weight: 400;
      text-align:center;
      line-height: 1.5;
    }
  </style>
</head>
<body>
<div id="error-container">
  <h1>Dev App not reachable :(</h1>
  <p>Your app is not reachable under the configured port ${appPort}.<br/>Please check if the dev server of your project is running and try again.</p>
</div>
</body>
</html>`;
