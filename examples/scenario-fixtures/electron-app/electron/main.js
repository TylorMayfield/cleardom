const { BrowserWindow } = require("electron");

export function createWindow() {
  const window = new BrowserWindow();
  return window.loadFile("renderer/index.html");
}
