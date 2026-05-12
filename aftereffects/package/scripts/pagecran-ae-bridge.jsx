/* Pagecran After Effects bridge for OpenCode.
 * Install this file in After Effects ScriptUI Panels and open it from Window.
 * The panel polls JSON command files and writes JSON result files.
 */
(function pagecranAfterEffectsBridge(thisObj) {
    var BRIDGE_NAME = "Pagecran After Effects Bridge";
    var POLL_INTERVAL_MS = 1000;
    var taskId = null;
    var isPolling = false;

    function getBridgeDir() {
        var configured = $.getenv("PAGECRAN_AFTEREFFECTS_BRIDGE_DIR") || $.getenv("AE_BRIDGE_DIR");
        if (configured && configured.length > 0) {
            return configured;
        }
        var localAppData = $.getenv("LOCALAPPDATA") || Folder.temp.fsName;
        return localAppData + "/Pagecran/AfterEffectsBridge";
    }

    function ensureFolder(path) {
        var folder = new Folder(path);
        if (!folder.exists) {
            folder.create();
        }
        return folder;
    }

    function ensureBridgeFolders() {
        var root = getBridgeDir();
        ensureFolder(root);
        ensureFolder(root + "/commands");
        ensureFolder(root + "/results");
        return root;
    }

    function readText(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) {
            throw new Error("Could not open file for read: " + file.fsName);
        }
        var text = file.read();
        file.close();
        return text;
    }

    function writeText(file, text) {
        file.encoding = "UTF-8";
        if (!file.open("w")) {
            throw new Error("Could not open file for write: " + file.fsName);
        }
        file.write(text);
        file.close();
    }

    function jsonStringify(value) {
        if (typeof JSON !== "undefined" && JSON.stringify) {
            return JSON.stringify(value, null, 2);
        }
        return value.toString();
    }

    function parseJson(text) {
        if (typeof JSON !== "undefined" && JSON.parse) {
            return JSON.parse(text);
        }
        return eval("(" + text + ")");
    }

    function writeStatus() {
        var root = ensureBridgeFolders();
        writeText(new File(root + "/status.json"), jsonStringify({
            ok: true,
            bridge: BRIDGE_NAME,
            polling: isPolling,
            appName: app.name,
            appVersion: app.version,
            projectFile: app.project && app.project.file ? app.project.file.fsName : null,
            updatedAt: (new Date()).toUTCString()
        }));
    }

    function toArray(value) {
        if (!value || typeof value.length !== "number") {
            return [];
        }
        var result = [];
        for (var i = 0; i < value.length; i += 1) {
            result.push(Number(value[i]));
        }
        return result;
    }

    function compSummary(comp) {
        return {
            id: comp.id,
            name: comp.name,
            width: comp.width,
            height: comp.height,
            pixelAspect: comp.pixelAspect,
            duration: comp.duration,
            frameRate: comp.frameRate,
            numLayers: comp.numLayers
        };
    }

    function layerSummary(layer) {
        return {
            index: layer.index,
            id: layer.id,
            name: layer.name,
            enabled: layer.enabled,
            startTime: layer.startTime,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            hasVideo: layer.hasVideo,
            hasAudio: layer.hasAudio
        };
    }

    function findComp(name) {
        if (!app.project) {
            throw new Error("No active After Effects project.");
        }
        for (var i = 1; i <= app.project.numItems; i += 1) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === name) {
                return item;
            }
        }
        throw new Error("Composition not found: " + name);
    }

    function findLayer(comp, args) {
        if (args.layer_index) {
            var index = Number(args.layer_index);
            if (index >= 1 && index <= comp.numLayers) {
                return comp.layer(index);
            }
        }
        if (args.layer_name) {
            var layer = comp.layer(String(args.layer_name));
            if (layer) {
                return layer;
            }
        }
        throw new Error("Provide a valid layer_name or layer_index.");
    }

    function setIfPresent(prop, value) {
        if (value === undefined || value === null || !prop) {
            return;
        }
        prop.setValue(value);
    }

    function handlePing() {
        return {
            ok: true,
            bridge: BRIDGE_NAME,
            appName: app.name,
            appVersion: app.version,
            projectOpen: Boolean(app.project)
        };
    }

    function handleGetProjectInfo() {
        var project = app.project;
        if (!project) {
            return { projectOpen: false };
        }
        return {
            projectOpen: true,
            file: project.file ? project.file.fsName : null,
            dirty: project.dirty,
            numItems: project.numItems,
            bitsPerChannel: project.bitsPerChannel,
            linearBlending: project.linearBlending
        };
    }

    function handleListCompositions() {
        var compositions = [];
        if (!app.project) {
            return { count: 0, compositions: compositions };
        }
        for (var i = 1; i <= app.project.numItems; i += 1) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                compositions.push(compSummary(item));
            }
        }
        return { count: compositions.length, compositions: compositions };
    }

    function handleCreateComposition(args) {
        if (!app.project) {
            app.newProject();
        }
        var name = String(args.name || "Pagecran Comp");
        var width = Number(args.width || 1920);
        var height = Number(args.height || 1080);
        var pixelAspect = Number(args.pixel_aspect || 1);
        var duration = Number(args.duration || 10);
        var frameRate = Number(args.frame_rate || 25);
        app.beginUndoGroup("Pagecran Create Composition");
        var comp = app.project.items.addComp(name, width, height, pixelAspect, duration, frameRate);
        app.endUndoGroup();
        return { ok: true, composition: compSummary(comp) };
    }

    function handleAddTextLayer(args) {
        var comp = findComp(String(args.composition_name));
        app.beginUndoGroup("Pagecran Add Text Layer");
        var layer = comp.layers.addText(String(args.text || ""));
        if (args.layer_name) {
            layer.name = String(args.layer_name);
        }
        if (args.position) {
            setIfPresent(layer.property("Transform").property("Position"), toArray(args.position));
        }
        if (args.font_size) {
            var textProp = layer.property("Source Text");
            var doc = textProp.value;
            doc.fontSize = Number(args.font_size);
            textProp.setValue(doc);
        }
        app.endUndoGroup();
        return { ok: true, composition: compSummary(comp), layer: layerSummary(layer) };
    }

    function handleSetLayerProperties(args) {
        var comp = findComp(String(args.composition_name));
        var layer = findLayer(comp, args);
        var transform = layer.property("Transform");
        app.beginUndoGroup("Pagecran Set Layer Properties");
        if (args.position) {
            setIfPresent(transform.property("Position"), toArray(args.position));
        }
        if (args.scale) {
            setIfPresent(transform.property("Scale"), toArray(args.scale));
        }
        if (args.rotation !== undefined && args.rotation !== null) {
            setIfPresent(transform.property("Rotation"), Number(args.rotation));
        }
        if (args.opacity !== undefined && args.opacity !== null) {
            setIfPresent(transform.property("Opacity"), Number(args.opacity));
        }
        if (args.start_time !== undefined && args.start_time !== null) {
            layer.startTime = Number(args.start_time);
        }
        if (args.in_point !== undefined && args.in_point !== null) {
            layer.inPoint = Number(args.in_point);
        }
        if (args.out_point !== undefined && args.out_point !== null) {
            layer.outPoint = Number(args.out_point);
        }
        if (args.enabled !== undefined && args.enabled !== null) {
            layer.enabled = Boolean(args.enabled);
        }
        app.endUndoGroup();
        return { ok: true, composition: compSummary(comp), layer: layerSummary(layer) };
    }

    function handleExecuteScript(args) {
        var script = String(args.script || "");
        if (!script) {
            throw new Error("script is required.");
        }
        var result = eval(script);
        return { ok: true, result: result };
    }

    function dispatch(command) {
        var args = command.args || {};
        if (command.method === "ping") {
            return handlePing(args);
        }
        if (command.method === "get_project_info") {
            return handleGetProjectInfo(args);
        }
        if (command.method === "list_compositions") {
            return handleListCompositions(args);
        }
        if (command.method === "create_composition") {
            return handleCreateComposition(args);
        }
        if (command.method === "add_text_layer") {
            return handleAddTextLayer(args);
        }
        if (command.method === "set_layer_properties") {
            return handleSetLayerProperties(args);
        }
        if (command.method === "execute_script") {
            return handleExecuteScript(args);
        }
        throw new Error("Unknown bridge method: " + command.method);
    }

    function processCommandFile(file) {
        var root = ensureBridgeFolders();
        var command = parseJson(readText(file));
        var resultPath = root + "/results/" + command.id + ".json";
        var payload;
        try {
            payload = {
                ok: true,
                id: command.id,
                method: command.method,
                result: dispatch(command),
                createdAt: command.createdAt,
                completedAt: (new Date()).toUTCString()
            };
        } catch (error) {
            payload = {
                ok: false,
                id: command.id,
                method: command.method,
                error: error && error.message ? error.message : String(error),
                createdAt: command.createdAt,
                completedAt: (new Date()).toUTCString()
            };
        }
        writeText(new File(resultPath), jsonStringify(payload));
        file.remove();
    }

    function pollOnce() {
        var root = ensureBridgeFolders();
        writeStatus();
        var commands = new Folder(root + "/commands").getFiles("*.json");
        commands.sort(function (a, b) { return a.modified.getTime() - b.modified.getTime(); });
        for (var i = 0; i < commands.length; i += 1) {
            processCommandFile(commands[i]);
        }
    }

    function scheduleNextPoll() {
        if (!isPolling) {
            return;
        }
        pollOnce();
        taskId = app.scheduleTask("pagecranAeBridgePoll()", POLL_INTERVAL_MS, false);
    }

    $.global.pagecranAeBridgePoll = scheduleNextPoll;

    function startPolling() {
        if (isPolling) {
            return;
        }
        isPolling = true;
        scheduleNextPoll();
    }

    function stopPolling() {
        isPolling = false;
        if (taskId) {
            app.cancelTask(taskId);
            taskId = null;
        }
        writeStatus();
    }

    function buildUi(thisObj) {
        var palette = thisObj instanceof Panel
            ? thisObj
            : new Window("palette", BRIDGE_NAME, undefined, { resizeable: true });
        palette.orientation = "column";
        palette.alignChildren = ["fill", "top"];

        var status = palette.add("statictext", undefined, "Bridge dir: " + getBridgeDir());
        status.characters = 60;
        var startButton = palette.add("button", undefined, "Start polling");
        var stopButton = palette.add("button", undefined, "Stop polling");
        startButton.onClick = function () { startPolling(); };
        stopButton.onClick = function () { stopPolling(); };

        palette.onClose = function () { stopPolling(); };
        palette.layout.layout(true);
        return palette;
    }

    var ui = buildUi(thisObj);
    ensureBridgeFolders();
    writeStatus();
    startPolling();
    if (ui instanceof Window) {
        ui.center();
        ui.show();
    }
})(this);
