
var RecentDBManager = require('./recent/local_recent_db_manager').LocalRecentDBManager;
var KeywordsDBManager = require('./keywords/keywords_db_manager').KeywordsDBManager;
var CacheManager = require('./cache_manager').CacheManager;

var SettingsHelper = require("./settings_helper").SettingsHelper;
var settingsHelper = new SettingsHelper();
var NoteOpener = require("./note/note-opener").NoteOpener;
var NoteUtils = require("./note/NoteUtils").NoteUtils;
var Search = require("./search").Search;
var currentSearch = undefined;
var Note = require("../browsers/note").Note;
var fs = require('fs');
const path = require('path')
var textVersion = require("textversionjs");
var currentcache = {}
var previews = {}

var handle = function (method, path, data, callback) {
    console.logDebug(method + " " + path)
    var splitPath = path.split("?")
    var pathBeforeArgs = splitPath[0]
    if (splitPath[1] != undefined) {
        var argsStr = path.split("?")[1]
        argsSplit = argsStr.split("&");
        var args = {}
        for (var arg of argsSplit) {
            argSplit = arg.split("=");
            args[decodeURIComponent(argSplit[0])] = decodeURIComponent(argSplit[1])
        }
    }

    if (method === "GET") {
        switch (pathBeforeArgs) {
            case "/notes/search":
                currentSearch = new Search(args['query'], settingsHelper.getNotePath() + "/" + args['path'])
                currentSearch.start();
                callback(false, "");
                return;
            case "/settings/themes":
                callback(false, '[{"name":"Carnet", "path":"css/carnet", "preview":"css/carnet/preview.png"}, {"name":"Dark", "path":"css/dark", "preview":"css/dark/preview.png"}]');
                return;
            case "/settings/browser_css":
                callback(false, settingsHelper.getBrowserCss())
                return;
            case "/settings/editor_css":
                callback(false, settingsHelper.getEditorCss())
                return;
            case "/settings/settings_css":
                callback(false, settingsHelper.getSettingsCss())
                return;
            case "/settings/lang/json":
                var lang = args["lang"]
                if (lang.indexOf("../") !== -1)
                    return;
                fs.readFile(__dirname + '/../i18n/' + lang + ".json", 'utf8', function (err, data) {
                    if (err) {
                        callback(true, null)
                        return;
                    }

                    callback(err, data)
                })
                return;
            case "/settings/changelog":
                fs.readFile(__dirname + '/../CHANGELOG.md', 'utf8', function (err, data) {
                    if (err) {
                        callback(true, null)
                        return;
                    }
                    const {
                        app,
                    } = require('electron');
                    var version = app.getVersion();
                    var last = settingsHelper.getLastChangelogVersion()
                    if (last != version) {
                        settingsHelper.setLastChangelogVersion(version)
                    }
                    callback(err, {
                        shouldDisplayChangelog: last != version,
                        changelog: data
                    })
                })
                return;
            case "/notes/getSearchCache":
                var toConvert = {}
                toConvert.files = currentSearch.result
                callback(false, toConvert)
                return;
            case "/settings/isfirstrun":
                callback(false, settingsHelper.isFirstRun())
                return;
            case "/settings/note_path":
                callback(false, settingsHelper.getNotePath())
                return;
            case "/settings/current_version":
                fs.readFile(__dirname + '/../version', 'utf8', function (err, data) {
                    if (err) {
                    }
                    callback(err, data)
                })
                return;
            case "/recentdb":
                new RecentDBManager(settingsHelper.getNotePath() + "/quickdoc/recentdb/" + settingsHelper.getAppUid()).getFullDB(function (err, data) {
                    callback(err, data)
                }, true);
                return;
            case "/settings/browser":
                callback(false, settingsHelper.getBrowserSettings())
                return
            case "/keywordsdb":
                new KeywordsDBManager(settingsHelper.getNotePath() + "/quickdoc/keywords/" + settingsHelper.getAppUid()).getFullDB(function (err, data) {

                    callback(err, data)
                }, true);
                return;
            case "/note/open/prepare":
                prepareEditor(callback);
                return;
            case "/note/open/0/listMedia":
                getMediaList(callback)
                return;
        }
        if (path.startsWith("/metadata?")) {
            console.logDebug("get metadata")

            var params = path.split("?")[1].split("=")[1].split("%2C");

            var handler = new ArrayHandler(params, function (step) {
                step = decodeURIComponent(step);
                if (step == "" || step == undefined || step.indexOf("../") >= 0) {
                    this.next()
                    return;
                }
                console.logDebug("get metadata " + step)
                var stepCorrected = cleanPath(step)
                var cached = CacheManager.getInstance().get(stepCorrected)
                if (cached != undefined) {
                    handler.addResult(step, {
                        shorttext: cached.shorttext,
                        metadata: cached.metadata,
                        previews: cached.previews
                    })
                    handler.next();
                    console.logDebug("from cache" + cached.shorttext)
                } else {
                    console.logDebug("not from cache")
                    new NoteOpener(new Note("", "", settingsHelper.getNotePath() + "/" + step)).getMainTextMetadataAndPreviews(function (text, metadata, previews) {
                        if (text != undefined) {
                            handler.addResult(step, {
                                shorttext: text.substr(0, text.length > 200 ? 200 : text.length),
                                metadata: metadata,
                                previews: previews
                            })
                        }
                        fs.stat(settingsHelper.getNotePath() + "/" + step, function (error, stats) {
                            if (error)
                                return;
                            CacheManager.getInstance().put(stepCorrected, {
                                last_file_modification: CacheManager.getMTimeFromStat(stats),
                                shorttext: text != undefined ? text.substr(0, text.length > 200 ? 200 : text.length) : "",
                                metadata: metadata,
                                previews: previews
                            })
                            CacheManager.getInstance().write()
                        })
                        handler.next();
                    })
                }
            }, function (result) {
                callback(false, JSON.stringify(result))
            });
            handler.next();
        }
        else if (path.startsWith("/note/create?path=")) {
            var folder = decodeURIComponent(path.split("=")[1]);
            if (folder.indexOf("../") >= 0) {
                callback(true, "");
                return;
            }
            if (!folder.startsWith("/"))
                folder = "/" + folder;
            if (!folder.endsWith("/"))
                folder = folder + "/";
            new NewNoteCreationTask(folder, function (path) {
                console.logDebug("found " + path)
                callback(false, path);

            })

        }
        else if (path.startsWith("/note/open")) {
            var folder = decodeURIComponent(path.split("=")[1]);
            if (folder.indexOf("../") >= 0) {
                callback(true, "");
                return;
            }
            openNote(folder, function (result) {
                console.logDebug("result " + result)
                callback(false, JSON.stringify(result))
            })
        }
        else if (path.startsWith("/browser/list?path=")) {
            var folder = decodeURIComponent(path.split("=")[1]);
            if (!folder.endsWith("/"))
                folder = folder + "/"
            if (folder.indexOf("../") >= 0) {
                callback(true, undefined);
                return;
            }
            else {
                var result = []
                fs.readdir(settingsHelper.getNotePath() + "/" + folder, (err, files) => {
                    if (files == undefined) {
                        files = []
                    }
                    var arrayResult = []
                    var arrayH = new ArrayHandler(files, function (f) {
                        if (folder + f === "/quickdoc" || f.startsWith(".")) {
                            arrayH.next();
                            return;
                        }
                        fs.stat(settingsHelper.getNotePath() + "/" + folder + f, (err, stat) => {
                            const file = {};
                            file['name'] = f;
                            file['path'] = folder + f;
                            file['isDir'] = !stat.isFile();
                            file['mtime'] = stat.mtime;
                            arrayResult.push(file)
                            arrayH.next()
                        }
                        )
                    }, function (result) {
                        var toConvert = {}
                        toConvert.files = arrayResult
                        callback(false, JSON.stringify(toConvert))
                    })
                    arrayH.next()

                })
            }

        }
    } else if (method === "POST") {
        switch (path) {
            case "/notes/metadata":
                var JSZip = require('jszip');

                var path = data.path;
                var metadata = data.metadata;
                fs.readFile(settingsHelper.getNotePath() + "/" + path, 'base64', function (err, dataZ) {
                    console.logDebug(err)

                    if (!err) {
                        var zip = new JSZip();
                        zip.loadAsync(dataZ, {
                            base64: true
                        }).then(function (contents) {
                            zip.file("metadata.json", metadata)
                            zip.generateAsync({ type: "base64" }).then(function (base64) {
                                fs.writeFile(settingsHelper.getNotePath() + "/" + path, base64, 'base64', function (err) {
                                    console.logDebug(err)

                                    if (!err) {
                                    } else callback(true)
                                });
                            });

                        });
                    } else callback(true)
                });
                break;
            case "/settings/note_path":
                settingsHelper.setNotePath(data.path)
                callback(false, undefined)
                console.logDebug("ok")
                return;
            case "/recentdb/action":
                for (action of data.data) {
                    console.logDebug(action.action);
                    new RecentDBManager(settingsHelper.getNotePath() + "/quickdoc/recentdb/" + settingsHelper.getAppUid()).action(action.path, action.action, action.time, function () {
                        callback(false, "");
                    })
                }
                break;
            case "/keywordsdb/action":
                new KeywordsDBManager(settingsHelper.getNotePath() + "/quickdoc/keywords/" + settingsHelper.getAppUid()).actionArray(data.data, function () {
                    callback(false, "");
                })

                break;
            case "/browser/newfolder":
                if (!data.path.startsWith("/"))
                    data.path = "/" + data.path
                if (data.path.indexOf("../") >= 0) {
                    callback(true)
                    return;
                }
                fs.mkdir(settingsHelper.getNotePath() + data.path, function (err) {
                    callback(err)
                })
                return;
            case "/settings/browser":
                settingsHelper.setBrowserSettings(data.jsonSettings)
                callback(false, "")
                return;

            case "/settings/app_theme":
                var metadataFolder = data.url;
                if (!metadataFolder.startsWith("/"))
                    metadataFolder = __dirname + "/../" + data.url
                fs.readFile(metadataFolder + '/metadata.json', 'utf8', function (err, result) {
                    result = JSON.parse(result)
                    console.logDebug(err)
                    console.logDebug("data " + JSON.stringify(result.browser))
                    for (var i = 0; i < result.browser.length; i++)
                        result.browser[i] = metadataFolder + "/" + result.browser[i]
                    for (var i = 0; i < result.editor.length; i++)
                        result.editor[i] = metadataFolder + "/" + result.editor[i]
                    for (var i = 0; i < result.settings.length; i++)
                        result.settings[i] = metadataFolder + "/" + result.settings[i]
                    settingsHelper.setBrowserCss(JSON.stringify(result.browser))
                    settingsHelper.setEditorCss(JSON.stringify(result.editor))
                    settingsHelper.setSettingsCss(JSON.stringify(result.settings))

                    callback(false, "")
                })

                return;
            case "/notes/move":
                if (data.from.startsWith("./"))
                    data.from = data.from.substr(2)
                if (data.to.startsWith("./"))
                    data.to = data.to.substr(2)
                if (data.from.startsWith("/"))
                    data.from = data.from.substr(1)
                if (data.to.startsWith("/"))
                    data.to = data.to.substr(1)
                if (data.from.indexOf("../") >= 0 || data.to.indexOf("../") >= 0) {
                    callback(true, "")
                    return;
                }
                NoteUtils.renameNote(data.from, data.to, function (success) {
                    callback(!success, "")
                })
                return;
            case "/note/saveText":
                data.path = decodeURIComponent(data.path);
                if (!data.path.startsWith("/"))
                    data.path = "/" + data.path
                if (data.path.indexOf("../") >= 0)
                    return
                saveTextToNote(data.path, data.html, data.metadata, callback);
                break;
            case "/note/open/0/addMedia": {
                console.logDebug(typeof data.files)

                addMedias(data.path, data.files, callback)
                return;
            }
        }
    } else if (method === "DELETE") {

        switch (pathBeforeArgs) {
            case "/notes":
                var toDelete = decodeURIComponent(path.split("=")[1])
                if (!toDelete.startsWith("./"))
                    toDelete = "/" + toDelete
                if (toDelete.indexOf("../") >= 0) {
                    callback(true, "")
                    return;
                }
                fs.unlink(settingsHelper.getNotePath() + toDelete, function () {
                    callback(false)
                })
                return;
            case "/note/open/0/media":
                console.logDebug("deleting " + args["media"])
                var toDelete = args["media"]
                if (!toDelete.startsWith("./"))
                    toDelete = "/" + toDelete
                if (toDelete.indexOf("../") >= 0) {
                    callback(true, "")
                    return;
                }
                var note = args["path"]
                if (!note.startsWith("./"))
                    note = "/" + note
                if (note.indexOf("../") >= 0) {
                    callback(true, "")
                    return;
                }
                var tmppath = getTmpPath() + "/note/data" + toDelete;
                fs.unlink(tmppath, function () {

                    fs.unlink(getTmpPath() + "/note/data/preview_" + toDelete.substring(1) + ".jpg", function (e) {
                        console.logDebug(e)
                        console.logDebug(JSON.stringify(previews))
                        if (!e)
                            delete previews["preview_" + toDelete.substring(1) + ".jpg"]

                        saveNote(note, function () {
                            getMediaList(callback)
                        })
                    })
                })
                return;


        }
    }

}
var getMediaList = function (callback) {
    var tmppath = getTmpPath() + "/note/data/";
    var medias = [];

    fs.readdir(tmppath, (err, files) => {
        if (err) {
            callback(false, medias) // return empty because no medias
            return
        }
        for (let file of files) {
            if (!file.startsWith("preview_"))
                medias.push(tmppath + file)
        }
        callback(false, medias)

    })
}

var addMedias = function (path, files, callback) {
    const Jimp = require('jimp');
    var tmppath = getTmpPath() + "/note/";
    require('mkdirp').sync(tmppath + 'data/');
    var handler = new ArrayHandler(files, function (file) {
        fs.writeFile(tmppath + 'data/' + file.name, file.data, 'base64', function (err) {
            if (!err) {
                Jimp.read(tmppath + 'data/' + file.name, (err, image) => {
                    if (!err) {
                        image.scaleToFit(400, 400);
                        image.getBase64(Jimp.MIME_JPEG, function (err, base) {
                            previews['preview_' + file.name + ".jpg"] = base;
                            fs.writeFile(tmppath + 'data/preview_' + file.name + ".jpg", base.replace(/^data:image\/\w+;base64,/, ""), 'base64', function (err) {
                                handler.next()
                            })

                        })

                    } else handler.next()

                })


            }
        })

    }, function () {
        saveNote(path, function (error, data) {
            getMediaList(callback)
        });
    });
    handler.next()
    for (var i = 0; i < files.length; i++) {


    }
}

var saveTextToNote = function (path, html, metadata, callback) {
    var tmppath = getTmpPath() + "/note/";
    fs.writeFile(tmppath + 'index.html', html, function (err) {
        if (err) {
            callback(true, "")
            return console.logDebug(err);
        }
        console.logDebug("saving meta  " + metadata)
        fs.writeFile(tmppath + 'metadata.json', metadata, function (err) {
            if (err) {
                callback(true, "")
                return console.logDebug(err);
            }
            console.logDebug("compress")
            var text = textVersion(html)
            currentcache.shorttext = text.substr(0, text.length > 200 ? 200 : text.length)
            currentcache.metadata = JSON.parse(metadata)
            saveNote(path, callback)

        });

    });
}
var cleanPath = function (path) {
    if (path == undefined)
        return undefined
    if (path.startsWith("./"))
        path = path.substr(2);
    if (path.startsWith("/"))
        path = path.substr(1)
    return path;
}
var saveNote = function (path, callback) {
    var note = new Note("", "", settingsHelper.getNotePath() + "/" + path)
    var noteOpener = new NoteOpener(note)
    var tmppath = getTmpPath() + "/note/";
    noteOpener.compressFrom(tmppath, function () {
        console.logDebug("compressed")
        callback(false, "")
        fs.stat(settingsHelper.getNotePath() + "/" + path, function (error, stats) {
            if (error)
                return;
            if (path.startsWith("/"))
                path = path.substr(1)
            var pre = Object.values(previews)
            currentcache.previews = []
            for (var i = 0; i < pre.length && i < 2; i++)
                currentcache.previews.push(pre[i])

            currentcache.last_file_modification = CacheManager.getMTimeFromStat(stats)
            CacheManager.getInstance().put(cleanPath(path), currentcache)
            CacheManager.getInstance().write();
        })
    })

}

var openNote = function (path, callback) {
    currentcache = {};
    previews = {}
    const tmppath = getTmpPath() + "/note/";
    console.logDebug("extractNote" + settingsHelper.getNotePath() + "/" + path + " to " + tmppath)
    var rimraf = require('rimraf');
    rimraf(tmppath, function (e) {
        var mkdirp = require('mkdirp');
        mkdirp.sync(tmppath);
        const noteOpener = new NoteOpener(new Note("", "", settingsHelper.getNotePath() + "/" + path));
        noteOpener.extractTo(tmppath, function (noSuchFile, expreviews) {
            var result = {}
            result["id"] = 0;
            currentcache = CacheManager.getInstance().get(cleanPath(path))
            if (currentcache == undefined)
                currentcache = {}
            if (expreviews == undefined)
                expreviews = {}
            previews = expreviews
            console.logDebug("done " + noSuchFile)
            if (!noSuchFile) {
                fs.readFile(tmppath + 'index.html', 'utf8', function read(err, data) {

                    if (err) {
                        throw err;
                    }
                    result["html"] = data
                    var text = textVersion(data)
                    currentcache.shorttext = text.substr(0, text.length > 200 ? 200 : text.length)
                    fs.readFile(tmppath + 'metadata.json', 'utf8', function read(err, metadata) {
                        if (err) {
                            throw err;
                        }
                        result["metadata"] = JSON.parse(metadata);
                        currentcache.metadata = result["metadata"];
                        callback(result)

                    });
                });
            } else {
                callback(result)
            }
            /*fs.readFile(tmppath+'metadata.json', function read(err, data) {
                if (err) {
                    throw err;
                    }
         
                    content = data;
                    console.logDebug(data)
                    this.note.metadata = JSON.parse(content)
                });*/
            //copying reader.html
        })
    })
}

var getTmpPath = function () {
    const {
        app,
    } = require('electron');
    return path.join(app.getPath("temp"), "tmpcarnet");
}

var prepareEditor = function (callback) {
    console.logDebug("prepareEditor");
    var rimraf = require('rimraf');
    const tmp = getTmpPath();

    rimraf(tmp, function (e) {
        var fs = require('fs');
        console.logDebug("rm " + e)
        fs.mkdir(tmp, function (e) {
            console.logDebug("mkdir " + e)

            fs.readFile(__dirname + '/../reader/reader.html', 'utf8', function (err, data) {
                if (err) {
                    fs.rea
                    console.logDebug("error ")
                    return console.logDebug(err);
                }
                const index = path.join(tmp, 'reader.html');
                data = data.replace(new RegExp('<!ROOTPATH>', 'g'), __dirname + '/../');
                data = data.replace(new RegExp('<!ROOTURL>', 'g'), __dirname + '/../');
                data = data.replace(new RegExp('<!APIURL>', 'g'), '')

                fs.writeFileSync(index, data);
                console.logDebug("index " + index)
                callback(false, index)
            });


        });

    })
}
var NewNoteCreationTask = function (folder, callback) {
    console.logDebug("NewNoteCreationTask " + path)
    var path = settingsHelper.getNotePath() + folder;
    fs.stat(path, function (error, stats) {
        if (error) {
            console.logDebug("not here")
            var mkdirp = require('mkdirp');
            mkdirp.sync(path);
        }
        var task = this;
        fs.readdir(path, (err, files) => {
            var name = "untitled";
            var sContinue = true;
            var i = 1;
            while (sContinue) {
                sContinue = false
                for (let file of files) {
                    if (file.startsWith(name)) {
                        sContinue = true;
                        i++;
                        name = "untitled " + i;
                    }
                }
            }
            var set = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            callback(folder.substr(1) + name + set.charAt(Math.floor(Math.random() * set.length)) + ".sqd")

        });
    })


}


class ArrayHandler {
    constructor(array, doNext, onFinished) {
        this.array = array;
        this.current = 0;
        this.result = {}
        this.doNext = doNext;
        this.onFinished = onFinished;
    }

    next() {
        if (this.array.length > 0) {
            this.doNext(this.array.pop());
        }
        else
            this.onFinished(this.result);

    }

    addResult(key, result) {
        this.result[key] = result;
    }

}
exports.handle = handle;