class SettingsCompatibility extends Compatibility {
    constructor() {
        super();
        var compatibility = this;
        $(document).ready(function () {
            if (compatibility.isElectron) {
                var SettingsHelper = require("./settings/settings_helper").SettingsHelper;
                var settingsHelper = new SettingsHelper();
                document.getElementById("window-frame-switch").checked = settingsHelper.displayFrame()
                document.getElementById("window-frame-switch").onchange = function () {
                    settingsHelper.setDisplayFrame(document.getElementById("window-frame-switch").checked)
                    const remote = require('electron').remote;
                    remote.app.relaunch();
                    remote.app.exit(0);
                }
                document.getElementById("export").parentElement.style.display = "none";
                document.getElementById("disconnect").onclick = function () {
                    settingsHelper.setRemoteWebdavAddr(undefined)
                    settingsHelper.setRemoteWebdavUsername(undefined)
                    settingsHelper.setRemoteWebdavPassword(undefined)
                    settingsHelper.setRemoteWebdavPath(undefined)
                    window.location.reload(true)
                }
                document.getElementById("connect").onclick = function () {
                    var {
                        remote
                    } = require('electron');
                    const BrowserWindow = remote.BrowserWindow;

                    var win = new BrowserWindow({
                        width: 500,
                        height: 500,
                        frame: true
                    });
                    const url = require('url')
                    const path = require('path')
                    win.loadURL(url.format({
                        pathname: path.join(__dirname, 'settings/webdav_dialog.html'),
                        protocol: 'file:',
                        slashes: true
                    }))
                    win.setMenu(null)

                }

                if (settingsHelper.getRemoteWebdavAddr() == undefined) {
                    document.getElementById("disconnect").parentElement.style.display = "none";
                    document.getElementById("connect").parentElement.style.display = "block";

                } else {
                    document.getElementById("connect").parentElement.style.display = "none";
                    document.getElementById("disconnect").parentElement.style.display = "block";

                }
            } else {
                document.getElementById("window-frame").parentElement.style.display = "none";
                document.getElementById("connect").parentElement.style.display = "none";
                document.getElementById("disconnect").parentElement.style.display = "none";
            }
        })

    }

}


var compatibility = new SettingsCompatibility();


