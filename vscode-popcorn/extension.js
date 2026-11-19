const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { findFinalAssignmentTargetOffsets } = require('./assignment-targets');
const {
    findImplicitVariableOffsets,
    findImplicitVariableScopeRanges,
    findPipelineGuideRanges,
    findVariableReferenceOffsets,
    variableAtOffset
} = require('./semantic-highlights');
const {
    analyzeDocument,
    findBlockRanges,
    findPipelineAtOffset,
    implicitContextAtOffset,
    implicitValueAtOffset,
    isImplicitMarkerAtOffset,
    findPropertyAtOffset,
    findPropertyDefinitions,
    findPropertyReferences,
    findUpdatePropertyOffsets,
    findVariableAtOffset,
    findVariableDefinitions,
    findVariableReferences,
    formatDocument,
    inferVariableType,
    isVariableName,
    STANDARD_FUNCTIONS,
    SYSTEM_KEYWORDS,
    tokenAtOffset,
    typeFlowSummary
} = require('./language-features');

let finalAssignmentTargetDecoration;
let pipelineGuideDecoration;
let implicitVariableDecoration;
let implicitScopeDecoration;
let variableReferenceDecoration;
let newUpdateKeyDecoration;
let diagnostics;
let resultsChannel;
const flowPanels = new Map();
let bundledRuntimePath = "";

function isPopCornEditor(editor) {
    return editor && editor.document.languageId === 'popcorn';
}

function refreshFinalAssignmentTargetDecorations(editor) {
    if (!isPopCornEditor(editor)) {
        return;
    }

    const enabled = vscode.workspace.getConfiguration('popcorn', editor.document.uri)
        .get('highlightFinalAssignmentTargets', true);
    if (!enabled) {
        editor.setDecorations(finalAssignmentTargetDecoration, []);
        return;
    }

    const document = editor.document;
    const ranges = findFinalAssignmentTargetOffsets(document.getText()).map(({ start, length }) =>
        new vscode.Range(document.positionAt(start), document.positionAt(start + length))
    );
    editor.setDecorations(finalAssignmentTargetDecoration, ranges);
}

function toRanges(document, offsets) {
    return offsets.map(({ start, length, end }) =>
        new vscode.Range(document.positionAt(start), document.positionAt(end ?? start + length))
    );
}

function documentRange(document) {
    return new vscode.Range(new vscode.Position(0, 0), document.positionAt(document.getText().length));
}

function variableNameAtPosition(document, position) {
    const text = document.getText();
    const token = tokenAtOffset(text, document.offsetAt(position));
    if (token && isVariableName(token.word)) return token.word;
    return findVariableAtOffset(text, document.offsetAt(position));
}

function selectedVariableName(document, selection) {
    if (!selection.isEmpty) {
        const selected = document.getText(selection);
        if (isVariableName(selected)) return selected;
    }
    return variableNameAtPosition(document, selection.active);
}

function variableInsight(text, name) {
    const definitions = findVariableDefinitions(text, name);
    const references = findVariableReferences(text, name);
    const assignment = definitions.find(definition => definition.kind === 'assignment');
    let typeFlow;
    if (assignment && Number.isInteger(assignment.lineStart)) {
        const lineEnd = text.indexOf('\n', assignment.lineStart);
        const line = text.slice(assignment.lineStart, lineEnd === -1 ? text.length : lineEnd);
        const operators = [...line.matchAll(/>>/g)];
        const lastOperator = operators.at(-1);
        if (lastOperator) {
            const pipeline = findPipelineAtOffset(text, assignment.lineStart + lastOperator.index + 1);
            typeFlow = pipeline && typeFlowSummary(pipeline.typeFlow);
        }
    }
    return {
        name,
        definitions,
        references,
        uses: Math.max(0, references.length - definitions.length),
        type: inferVariableType(text, name),
        typeFlow: typeFlow || (definitions.some(definition => definition.kind === 'stream-parameter')
            ? 'ストリーム入力 → ストリーム要素'
            : '型を推定できません')
    };
}

function markdownLines(lines) {
    return new vscode.MarkdownString(lines.filter(Boolean).join('  \n'));
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
}

function flowNodeKind(label) {
    if (/^::/.test(label)) return 'property';
    if (/^(when|else|as|new|in)\b/.test(label)) return 'system';
    if (/^[A-Z][a-zA-Z0-9_]*/.test(label)) return 'function';
    if (/^[\[{]/.test(label)) return 'object';
    return 'variable';
}

function stagesFromLine(line, lineNumber) {
    const operators = [...line.matchAll(/>>/g)];
    if (!operators.length) return [];
    const stages = [];
    const input = line.slice(0, operators[0].index).trim();
    if (input && input !== ':)') stages.push({ line: lineNumber, label: input, kind: flowNodeKind(input) });
    operators.forEach((operator, index) => {
        const start = operator.index + operator[0].length;
        const end = index + 1 < operators.length ? operators[index + 1].index : line.length;
        const label = line.slice(start, end).trim().replace(/(?:\(:|:\)|[.:])+$/, '').trim() || '処理';
        stages.push({ line: lineNumber, label, kind: flowNodeKind(label) });
    });
    return stages;
}

function buildFlowModel(flowText, firstLine) {
    const items = flowText.split(/\r?\n/).map((line, index) => ({ line, number: firstLine + index }));
    const header = items.find(item => />>\s*Map\b/i.test(item.line));
    const update = items.find(item => />>\s*Update\b/i.test(item.line));
    if (!header || !update) return { kind: 'linear', nodes: items.flatMap(item => stagesFromLine(item.line, item.number)) };
    const headerStages = stagesFromLine(header.line, header.number);
    const updateStages = stagesFromLine(update.line, update.number);
    const branches = items.filter(item => item.number > update.number && /^\s*\(?\s*(?:@|[a-z_][a-zA-Z0-9_]*)?::/.test(item.line)).map(item => {
        const stages = stagesFromLine(item.line, item.number);
        return { input: stages[0], steps: stages.slice(1) };
    });
    const tail = items.filter(item => /^\s*:\)/.test(item.line) && />>/.test(item.line)).flatMap(item => stagesFromLine(item.line, item.number));
    return {
        kind: 'map-update',
        root: headerStages[0],
        map: headerStages.find(stage => /^Map\b/i.test(stage.label)),
        updateInput: updateStages[0],
        updateLine: update.number,
        branches,
        tail
    };
}

function flowCard(node) {
    if (!node) return '';
    return `<div class="node ${node.kind || 'variable'}" data-line="${node.line}"><span class="line">L ${node.line}</span><span class="label">${escapeHtml(node.label)}</span><span class="value">待機中</span></div>`;
}

function flowHtmlLegacy(nodes) {
    const cards = nodes.map(node => `<div class="node ${node.kind}" data-line="${node.line}"><span class="line">${node.line} 行目</span><span class="label">${escapeHtml(node.label)}</span><span class="value">待機中</span></div>`).join('<span class="arrow">→</span>');
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><style>
        body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:18px}
        h2{margin:0 0 8px;font-size:18px}.hint{opacity:.75;margin-bottom:18px}.flow{display:flex;flex-wrap:wrap;align-items:center;gap:9px}
        .node{min-width:118px;max-width:220px;padding:10px;border:1px solid var(--vscode-panel-border);border-radius:8px;background:var(--vscode-editor-inactiveSelectionBackground);transition:.25s}
        .node.input{border-color:#569cd6}.node.target{border-color:#4ec9b0}.line{display:block;opacity:.7;font-size:11px}.label{display:block;font-weight:600;word-break:break-word}.value{display:block;margin-top:6px;font-family:var(--vscode-editor-font-family);font-size:11px;opacity:.8;word-break:break-all}
        .node.active{background:#a3be8c55;border-color:#a3be8c;box-shadow:0 0 16px #a3be8c66}.node.done{background:#4ec9b033}.node.error{background:#f4877133;border-color:#f48771}.arrow{font-size:20px;opacity:.6}.status{padding:7px 10px;border-radius:5px;background:var(--vscode-textBlockQuote-background);margin-bottom:14px}
    </style></head><body><h2>PopCorn データフロー</h2><div id="status" class="status">実行ボタンを押すと、実際の値の変化を表示します。</div><div class="hint">ノードはパイプラインの入力・処理・代入先です。</div><div class="flow">${cards || '表示できるパイプラインがありません。'}</div><script>
        const status=document.getElementById('status');
        window.addEventListener('message', event=>{const data=event.data;if(data.type==='start'){status.textContent='実行中… 値の変化を受信しています。';document.querySelectorAll('.node').forEach(n=>n.classList.remove('active','done','error'))}if(data.type==='trace'){const nodes=[...document.querySelectorAll('.node[data-line="'+data.line+'"]')];document.querySelectorAll('.node.active').forEach(n=>n.classList.replace('active','done'));nodes.forEach(n=>{n.classList.add('active');n.querySelector('.value').textContent=data.value})}if(data.type==='finish'){document.querySelectorAll('.node.active').forEach(n=>n.classList.replace('active','done'));status.textContent=data.ok?'実行完了':'実行はエラーで終了しました';}});
    </script></body></html>`;
}

function flowHtml(model) {
    const down = '<div class="arrow">↓</div>';
    const sequence = nodes => nodes.map((node, index) => `${flowCard(node)}${index + 1 < nodes.length ? down : ''}`).join('');
    const content = model.kind === 'map-update'
        ? `<div class="vertical">${flowCard(model.root)}${down}${flowCard(model.map)}${down}<section class="update-frame" data-line="${model.updateLine}"><h3>Update（${escapeHtml(model.updateInput?.label || '@')}）</h3><div class="branches">${model.branches.map(branch => `<div class="branch">${sequence([branch.input, ...branch.steps])}</div>`).join('')}</div></section>${down}${flowCard({ line:model.updateLine, label:`${model.updateInput?.label || '@'}（更新済み）`, kind:'variable' })}${model.tail.length ? `${down}${sequence(model.tail)}` : ''}</div>`
        : `<div class="vertical">${sequence(model.nodes)}</div>`;
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><style>
        body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:18px}.title{margin:0 0 12px;font-size:20px}.status{padding:7px 10px;border-radius:5px;background:var(--vscode-textBlockQuote-background);margin-bottom:14px}.status:empty{display:none}.vertical{display:flex;flex-direction:column;align-items:center;gap:8px}.node{width:min(380px,92%);padding:13px;border:2px solid var(--vscode-panel-border);border-radius:10px;transition:.25s}.node.variable{background:#007acc88;border-color:#4fc1ff}.node.function{background:#b5890088;border-color:#ffd866}.node.system{background:#a05ab788;border-color:#e8a6ff}.node.property{background:#d1696988;border-color:#ffb3a7}.node.object{background:#3c9d9b88;border-color:#79e6e0}.line{display:block;opacity:.86;font-size:12px}.label{display:block;margin-top:2px;font-size:19px;font-weight:650;word-break:break-word}.value{display:block;margin-top:7px;font-family:var(--vscode-editor-font-family);font-size:12px;opacity:.95;white-space:pre-wrap;word-break:break-all}.arrow{font-size:22px;line-height:20px;opacity:.85}.update-frame{width:min(980px,98%);padding:16px;border:3px solid #e8a6ff;border-radius:14px;background:#a05ab733}.update-frame h3{margin:0 0 14px;color:#e8a6ff;font-size:19px}.branches{display:flex;align-items:flex-start;justify-content:center;gap:14px;overflow-x:auto}.branch{min-width:165px;display:flex;flex-direction:column;align-items:center;gap:8px}.branch .node{width:140px}.node.active{background:#65c466cc;border-color:#c8ffca;box-shadow:0 0 18px #65c466aa}.node.done{filter:saturate(.75);opacity:.88}.node.error{background:#e0525288;border-color:#ffaaa8}
    </style></head><body><h2 class="title">PopCorn データフロー</h2><div id="status" class="status"></div>${content}<script>const status=document.getElementById('status');window.addEventListener('message',event=>{const d=event.data;if(d.type==='start'){status.textContent='実行中';document.querySelectorAll('.node').forEach(n=>n.classList.remove('active','done','error'))}if(d.type==='trace'){document.querySelectorAll('.node.active').forEach(n=>n.classList.replace('active','done'));const nodes=[...document.querySelectorAll('.node[data-line="'+d.line+'"]')];nodes.forEach(n=>{n.classList.add('active');n.querySelector('.value').textContent=d.before&&d.after?d.before+' → '+d.after:(d.after||d.value||'処理中')});if(d.progress)status.textContent=d.progress}if(d.type==='finish'){document.querySelectorAll('.node.active').forEach(n=>n.classList.replace('active','done'));status.textContent=d.ok?'完了':'エラー'}});</script></body></html>`;
}

function selectedOriginFlow(editor) {
    const document = editor.document;
    const position = editor.selection.active;
    const line = document.lineAt(position.line).text;
    const operator = />>/.exec(line);
    if (!operator || position.character >= operator.index) return undefined;
    const pipeline = findPipelineAtOffset(document.getText(), document.offsetAt(new vscode.Position(position.line, operator.index + 1)));
    return pipeline && { text: document.getText().slice(pipeline.start, pipeline.end), firstLine: document.positionAt(pipeline.start).line + 1 };
}

function showFlowVisualizer(editor) {
    if (!isPopCornEditor(editor)) return;
    const selected = selectedOriginFlow(editor);
    if (!selected) {
        vscode.window.showInformationMessage('パイプラインの起点（最初の >> より前）をクリックしてから表示してください。');
        return;
    }
    const key = editor.document.fileName;
    const html = flowHtml(buildFlowModel(selected.text, selected.firstLine));
    const previous = flowPanels.get(key);
    if (previous) {
        previous.panel.reveal(vscode.ViewColumn.Beside);
        previous.panel.webview.html = html;
        return;
    }
    const panel = vscode.window.createWebviewPanel('popcornFlow', 'PopCorn データフロー', vscode.ViewColumn.Beside, { enableScripts: true });
    panel.webview.html = html;
    flowPanels.set(key, { panel });
    panel.onDidDispose(() => flowPanels.delete(key));
}

function postFlow(filePath, message) {
    flowPanels.get(filePath)?.panel.webview.postMessage(message);
}

function refreshDiagnostics(document) {
    if (!document || document.languageId !== 'popcorn') {
        return;
    }
    const enabled = vscode.workspace.getConfiguration('popcorn', document.uri).get('enableDiagnostics', true);
    if (!enabled) {
        diagnostics.delete(document.uri);
        return;
    }

    const severity = {
        error: vscode.DiagnosticSeverity.Error,
        warning: vscode.DiagnosticSeverity.Warning,
        information: vscode.DiagnosticSeverity.Information
    };
    const items = analyzeDocument(document.getText()).map(item => {
        const range = new vscode.Range(document.positionAt(item.start), document.positionAt(item.start + item.length));
        const diagnostic = new vscode.Diagnostic(range, item.message, severity[item.severity]);
        diagnostic.source = 'PopCorn';
        diagnostic.code = item.kind;
        return diagnostic;
    });
    diagnostics.set(document.uri, items);
}

function refreshStaticSemanticDecorations(editor) {
    if (!isPopCornEditor(editor)) {
        return;
    }

    const document = editor.document;
    const text = document.getText();
    const settings = vscode.workspace.getConfiguration('popcorn', document.uri);

    editor.setDecorations(
        pipelineGuideDecoration,
        settings.get('visualizePipelineFlow', false) ? toRanges(document, findPipelineGuideRanges(text)) : []
    );
    editor.setDecorations(
        implicitVariableDecoration,
        settings.get('highlightImplicitVariableScopes', true) ? toRanges(document, findImplicitVariableOffsets(text)) : []
    );
    editor.setDecorations(
        implicitScopeDecoration,
        settings.get('highlightImplicitVariableScopes', true) ? toRanges(document, findImplicitVariableScopeRanges(text)) : []
    );
    editor.setDecorations(
        newUpdateKeyDecoration,
        toRanges(document, findUpdatePropertyOffsets(text).filter(property => property.isNew))
    );
}

function refreshVariableFlowDecorations(editor) {
    if (!isPopCornEditor(editor)) {
        return;
    }

    const document = editor.document;
    const settings = vscode.workspace.getConfiguration('popcorn', document.uri);
    const text = document.getText();
    if (!settings.get('highlightVariableFlow', true)) {
        editor.setDecorations(variableReferenceDecoration, []);
        return;
    }
    const variableName = selectedVariableName(document, editor.selection);
    if (!variableName) {
        editor.setDecorations(variableReferenceDecoration, []);
        return;
    }

    const references = findVariableReferenceOffsets(text, variableName);

    editor.setDecorations(variableReferenceDecoration, toRanges(document, references));
}

function refreshVisiblePopCornEditors() {
    for (const editor of vscode.window.visibleTextEditors) {
        refreshFinalAssignmentTargetDecorations(editor);
        refreshStaticSemanticDecorations(editor);
        refreshVariableFlowDecorations(editor);
        refreshDiagnostics(editor.document);
    }
}

function runtimeCommandFor(filePath) {
    const configuredPath = vscode.workspace.getConfiguration('popcorn').get('runtimePath', '').trim();
    if (configuredPath && fs.existsSync(configuredPath)) {
        return { command: configuredPath, args: [filePath] };
    }
    if (process.platform === 'win32' && bundledRuntimePath && fs.existsSync(bundledRuntimePath)) {
        return { command: bundledRuntimePath, args: [filePath] };
    }
    return { command: 'popcorn', args: [filePath] };
}

function runPopCornFile(filePath) {
    const runtime = runtimeCommandFor(filePath);
    const startedAt = Date.now();
    resultsChannel.clear();
    resultsChannel.appendLine(`▶ PopCorn 実行: ${path.basename(filePath)}`);
    resultsChannel.show(true);
    const tracePath = path.join(os.tmpdir(), `popcorn-flow-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`);
    let consumedTraceLines = 0;
    postFlow(filePath, { type: 'start' });
    const onTraceChange = () => {
        fs.readFile(tracePath, 'utf8', (error, data) => {
            if (error) return;
            const lines = data.trim().split('\n').filter(Boolean);
            lines.slice(consumedTraceLines).forEach(line => {
                try { postFlow(filePath, { type: 'trace', ...JSON.parse(line) }); } catch (_) {}
            });
            consumedTraceLines = lines.length;
        });
    };
    fs.watchFile(tracePath, { interval: 120 }, onTraceChange);

    const child = spawn(runtime.command, runtime.args, {
        cwd: path.dirname(filePath),
        windowsHide: true,
        env: { ...process.env, POPCORN_TRACE_FILE: tracePath }
    });
    child.stdout.on('data', data => resultsChannel.append(data.toString()));
    child.stderr.on('data', data => resultsChannel.append(data.toString()));
    child.on('error', error => {
        resultsChannel.appendLine(`\n✗ 実行を開始できませんでした: ${error.message}`);
        resultsChannel.appendLine('PopCorn をインストールするか、popcorn.runtimePath を設定してください。');
        postFlow(filePath, { type: 'finish', ok: false });
    });
    child.on('close', code => {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
        resultsChannel.appendLine(`\n${code === 0 ? '✓ 完了' : `✗ 終了コード ${code}`} (${elapsed} 秒)`);
        setTimeout(() => {
            fs.unwatchFile(tracePath, onTraceChange);
            fs.readFile(tracePath, 'utf8', (error, data) => {
                if (!error) data.trim().split('\n').slice(consumedTraceLines).filter(Boolean).forEach(line => {
                    try { postFlow(filePath, { type: 'trace', ...JSON.parse(line) }); } catch (_) {}
                });
                fs.unlink(tracePath, () => {});
                postFlow(filePath, { type: 'finish', ok: code === 0 });
            });
        }, 160);
    });
}

function activate(context) {
    bundledRuntimePath = context.extensionPath
        ? path.join(context.extensionPath, 'runtime', 'popcorn.exe')
        : '';
    diagnostics = vscode.languages.createDiagnosticCollection('popcorn');
    resultsChannel = vscode.window.createOutputChannel('PopCorn 実行結果');
    finalAssignmentTargetDecoration = vscode.window.createTextEditorDecorationType({
        fontWeight: 'bold',
        fontStyle: 'italic',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    pipelineGuideDecoration = vscode.window.createTextEditorDecorationType({
        borderColor: 'rgba(99, 179, 237, 0.32)',
        borderStyle: 'solid',
        borderWidth: '0 0 1px 0'
    });
    implicitVariableDecoration = vscode.window.createTextEditorDecorationType({
        color: '#C586C0',
        fontWeight: 'bold',
        fontStyle: 'italic'
    });
    implicitScopeDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(197, 134, 192, 0.06)',
        borderColor: 'rgba(197, 134, 192, 0.22)',
        borderStyle: 'solid',
        borderWidth: '0 0 0 2px',
        isWholeLine: true
    });
    variableReferenceDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(78, 201, 176, 0.35)',
        border: '1px solid #4EC9B0',
        borderRadius: '3px',
        overviewRulerColor: '#4EC9B0',
        overviewRulerLane: vscode.OverviewRulerLane.Center
    });
    newUpdateKeyDecoration = vscode.window.createTextEditorDecorationType({
        color: '#9CDCFE',
        fontStyle: 'italic',
        backgroundColor: 'rgba(156, 220, 254, 0.10)',
        borderColor: 'rgba(156, 220, 254, 0.38)',
        borderStyle: 'dotted',
        borderWidth: '0 0 1px 0'
    });

    let disposable = vscode.commands.registerCommand('popcorn.runFile', function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('実行する PopCorn ファイルを開いてください。');
            return;
        }

        const filePath = editor.document.fileName;
        editor.document.save().then(() => runPopCornFile(filePath));
    });
    const refreshHighlightsDisposable = vscode.commands.registerCommand(
        'popcorn.refreshFlowHighlights',
        refreshVisiblePopCornEditors
    );
    const showResultsDisposable = vscode.commands.registerCommand('popcorn.showResults', () => resultsChannel.show(true));
    const showFlowDisposable = vscode.commands.registerCommand('popcorn.showFlowVisualizer', () => {
        showFlowVisualizer(vscode.window.activeTextEditor);
    });

    const selector = { language: 'popcorn' };
    const definitionProvider = vscode.languages.registerDefinitionProvider(selector, {
        provideDefinition(document, position) {
            const text = document.getText();
            const property = findPropertyAtOffset(text, document.offsetAt(position));
            if (property) {
                return findPropertyDefinitions(text, property.name).map(definition =>
                    new vscode.Location(document.uri, new vscode.Range(
                        document.positionAt(definition.start),
                        document.positionAt(definition.start + definition.length)
                    ))
                );
            }
            const name = variableNameAtPosition(document, position);
            if (!name) return undefined;
            return findVariableDefinitions(text, name).map(definition =>
                new vscode.Location(document.uri, new vscode.Range(
                    document.positionAt(definition.start),
                    document.positionAt(definition.start + definition.length)
                ))
            );
        }
    });
    const referenceProvider = vscode.languages.registerReferenceProvider(selector, {
        provideReferences(document, position) {
            const text = document.getText();
            const property = findPropertyAtOffset(text, document.offsetAt(position));
            if (property) {
                return findPropertyReferences(text, property.name).map(reference =>
                    new vscode.Location(document.uri, new vscode.Range(
                        document.positionAt(reference.start),
                        document.positionAt(reference.start + reference.length)
                    ))
                );
            }
            const name = variableNameAtPosition(document, position);
            if (!name) return [];
            return findVariableReferences(text, name).map(reference =>
                new vscode.Location(document.uri, new vscode.Range(
                    document.positionAt(reference.start),
                    document.positionAt(reference.start + reference.length)
                ))
            );
        }
    });
    const renameProvider = vscode.languages.registerRenameProvider(selector, {
        prepareRename(document, position) {
            const text = document.getText();
            const property = findPropertyAtOffset(text, document.offsetAt(position));
            if (property) {
                return new vscode.Range(
                    document.positionAt(property.start),
                    document.positionAt(property.start + property.length)
                );
            }
            const name = variableNameAtPosition(document, position);
            if (!name) throw new Error('変数名の位置にカーソルを置いてください。');
            const offset = document.offsetAt(position);
            const occurrence = findVariableReferences(document.getText(), name)
                .find(reference => offset >= reference.start && offset <= reference.start + reference.length);
            return occurrence && new vscode.Range(
                document.positionAt(occurrence.start),
                document.positionAt(occurrence.start + occurrence.length)
            );
        },
        provideRenameEdits(document, position, newName) {
            if (!isVariableName(newName)) throw new Error('変数名は小文字または _ で始めてください。');
            const text = document.getText();
            const property = findPropertyAtOffset(text, document.offsetAt(position));
            if (property) {
                const edits = new vscode.WorkspaceEdit();
                for (const reference of findPropertyReferences(text, property.name)) {
                    edits.replace(document.uri, new vscode.Range(
                        document.positionAt(reference.start),
                        document.positionAt(reference.start + reference.length)
                    ), newName);
                }
                return edits;
            }
            const name = variableNameAtPosition(document, position);
            if (!name) throw new Error('変数名の位置にカーソルを置いてください。');
            const edits = new vscode.WorkspaceEdit();
            for (const reference of findVariableReferences(text, name)) {
                edits.replace(document.uri, new vscode.Range(
                    document.positionAt(reference.start),
                    document.positionAt(reference.start + reference.length)
                ), newName);
            }
            return edits;
        }
    });
    const hoverProvider = vscode.languages.registerHoverProvider(selector, {
        provideHover(document, position) {
            const text = document.getText();
            const offset = document.offsetAt(position);
            const pipeline = findPipelineAtOffset(text, offset);
            if (pipeline) {
                const markdown = new vscode.MarkdownString();
                markdown.appendMarkdown(`パイプライン（第 ${pipeline.stageNumber} 段階）  \n`);
                markdown.appendCodeblock(`${pipeline.operator} ${pipeline.stage || '(終端)'}`, 'popcorn');
                markdown.appendMarkdown(`入力の推定型: ${pipeline.inputType}  \n`);
                markdown.appendMarkdown(`この段階の出力型: ${pipeline.outputType}  \n`);
                markdown.appendMarkdown(`型の流れ: ${typeFlowSummary(pipeline.typeFlow)}`);
                if (pipeline.target) markdown.appendMarkdown(`  \n最終代入先: \`${pipeline.target}\``);
                return new vscode.Hover(markdown, new vscode.Range(document.positionAt(pipeline.start), document.positionAt(pipeline.end)));
            }

            const property = findPropertyAtOffset(text, offset);
            if (property) {
                const updateProperty = findUpdatePropertyOffsets(text).find(candidate => candidate.start === property.start);
                const implicitContext = implicitContextAtOffset(text, offset);
                const expandedProperty = implicitContext
                    ? `${implicitContext.value}::${property.name}`
                    : `@::${property.name}`;
                const lines = [
                    `\`::${property.name}\``,
                    `省略形: \`${expandedProperty}\``
                ];
                if (updateProperty?.isNew) {
                    lines.push('Update により追加される新規キーです。');
                    lines.push('このキーは斜体で表示されます。');
                } else if (updateProperty) {
                    lines.push('Update 内で更新または削除されるキーです。');
                } else {
                    lines.push('辞書・レコードのキーを指定します。');
                }
                return new vscode.Hover(markdownLines(lines), new vscode.Range(
                    document.positionAt(property.start - 2),
                    document.positionAt(property.start + property.length)
                ));
            }

            if (isImplicitMarkerAtOffset(text, offset)) {
                const implicitContext = implicitContextAtOffset(text, offset);
                const currentValue = implicitValueAtOffset(text, offset);
                const lines = [
                    '`@`',
                    currentValue
                        ? `現在の値: \`${currentValue.expression}\`（${currentValue.type}）`
                        : implicitContext
                        ? `現在の値: \`${implicitContext.value}\`（${implicitContext.stream} の要素）`
                        : '現在のパイプライン値を表します。'
                ];
                if (!implicitContext) {
                    lines.push('スコープ外でも使用できますが、この書き方は推奨しません。');
                }
                return new vscode.Hover(markdownLines(lines), new vscode.Range(
                    document.positionAt(offset), document.positionAt(offset + 1)
                ));
            }

            const token = tokenAtOffset(text, offset);
            if (token && STANDARD_FUNCTIONS[token.word]) {
                const standard = STANDARD_FUNCTIONS[token.word];
                const output = standard.output === 'same' ? '入力と同じ型' : standard.output;
                return new vscode.Hover(markdownLines([
                    `\`${token.word}\``,
                    standard.description,
                    `型の変化: 入力 → ${output}`
                ]), new vscode.Range(
                    document.positionAt(token.start),
                    document.positionAt(token.start + token.length)
                ));
            }
            if (token && SYSTEM_KEYWORDS[token.word]) {
                return new vscode.Hover(markdownLines([
                    `\`${token.word}\``,
                    SYSTEM_KEYWORDS[token.word]
                ]), new vscode.Range(
                    document.positionAt(token.start),
                    document.positionAt(token.start + token.length)
                ));
            }
            const name = variableNameAtPosition(document, position);
            if (!name) return undefined;
            const insight = variableInsight(text, name);
            return new vscode.Hover(markdownLines([
                `\`${name}\``,
                `宣言: ${insight.definitions.length} 件 / 利用: ${insight.uses} 件`,
                `推定型: ${insight.type}`,
                `型の流れ: ${insight.typeFlow}`
            ]));
        }
    });
    const adviceCodeActionProvider = vscode.languages.registerCodeActionsProvider
        ? vscode.languages.registerCodeActionsProvider(selector, {
        provideCodeActions(document, _range, context) {
            const ignorableKinds = new Set(["likely-update-key-typo", "implicit-variable-scope"]);
            return context.diagnostics
                .filter(diagnostic => ignorableKinds.has(String(diagnostic.code)))
                .map(diagnostic => {
                    const action = new vscode.CodeAction(
                        "この忠告を無視する（この行）",
                        vscode.CodeActionKind.QuickFix
                    );
                    action.diagnostics = [diagnostic];
                    const edit = new vscode.WorkspaceEdit();
                    const lineEnd = document.lineAt(diagnostic.range.end.line).range.end;
                    edit.insert(document.uri, lineEnd, ` // popcorn-ignore: ${diagnostic.code}`);
                    action.edit = edit;
                    return action;
                });
        }
        })
        : { dispose() {} };
    const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider(selector, {
        provideDocumentFormattingEdits(document, options) {
            const formatted = formatDocument(document.getText(), options.insertSpaces ? options.tabSize : 4);
            return formatted === document.getText() ? [] : [vscode.TextEdit.replace(documentRange(document), formatted)];
        }
    });
    const symbolProvider = vscode.languages.registerDocumentSymbolProvider(selector, {
        provideDocumentSymbols(document) {
            return findBlockRanges(document.getText()).map(block => {
                const kind = block.kind === 'function' ? vscode.SymbolKind.Function
                    : block.kind === 'stream' ? vscode.SymbolKind.Method : vscode.SymbolKind.Namespace;
                const range = new vscode.Range(new vscode.Position(block.startLine, 0), new vscode.Position(block.endLine, document.lineAt(block.endLine).text.length));
                return new vscode.DocumentSymbol(block.name, block.kind, kind, range, new vscode.Range(new vscode.Position(block.startLine, 0), new vscode.Position(block.startLine, document.lineAt(block.startLine).text.length)));
            });
        }
    });
    const foldingProvider = vscode.languages.registerFoldingRangeProvider(selector, {
        provideFoldingRanges(document) {
            return findBlockRanges(document.getText())
                .filter(block => block.endLine > block.startLine)
                .map(block => new vscode.FoldingRange(block.startLine, block.endLine - 1));
        }
    });

    context.subscriptions.push(
        disposable,
        refreshHighlightsDisposable,
        finalAssignmentTargetDecoration,
        pipelineGuideDecoration,
        implicitVariableDecoration,
        implicitScopeDecoration,
        variableReferenceDecoration,
        newUpdateKeyDecoration,
        definitionProvider,
        referenceProvider,
        renameProvider,
        hoverProvider,
        adviceCodeActionProvider,
        formattingProvider,
        symbolProvider,
        foldingProvider,
        showResultsDisposable,
        showFlowDisposable,
        diagnostics,
        resultsChannel,
        vscode.workspace.onDidChangeTextDocument(event => {
            for (const editor of vscode.window.visibleTextEditors) {
                if (editor.document === event.document) {
                    refreshFinalAssignmentTargetDecorations(editor);
                    refreshStaticSemanticDecorations(editor);
                    refreshVariableFlowDecorations(editor);
                }
            }
            refreshDiagnostics(event.document);
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            refreshFinalAssignmentTargetDecorations(editor);
            refreshStaticSemanticDecorations(editor);
            refreshVariableFlowDecorations(editor);
        }),
        vscode.window.onDidChangeTextEditorSelection(event => {
            refreshVariableFlowDecorations(event.textEditor);
            const flowPanel = flowPanels.get(event.textEditor.document.fileName);
            const selected = flowPanel && selectedOriginFlow(event.textEditor);
            if (selected) {
                flowPanel.panel.webview.html = flowHtml(buildFlowModel(selected.text, selected.firstLine));
            }
        }),
        vscode.window.onDidChangeVisibleTextEditors(refreshVisiblePopCornEditors),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('popcorn')) {
                refreshVisiblePopCornEditors();
            }
        })
    );

    refreshVisiblePopCornEditors();
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
