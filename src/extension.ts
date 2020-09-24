import * as vscode from 'vscode';
import * as path from 'path';

import { setApiEndpointAction } from './set-api-endpoint-action';
import { uploadTemplateAction } from './upload-template-action';
import { downloadTemplateAction } from './download-template-action';

export let CURRENTLY_SELECTED_FILE: string;
export let CURRENT_DIR_PATH: string;

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('template-library.actions', async (uri?: vscode.Uri) => {
		if (uri) {
			vscode.window.showInformationMessage(`Selected file is: ${uri.fsPath}`);
			let fileExtension = uri.fsPath.split('.').pop();
			if (['csar', 'zip', 'tar', 'rar', 'gz', 'tgz', 'yml', 'yaml', 'tosca'].includes(fileExtension!!)) {
				CURRENTLY_SELECTED_FILE = uri.fsPath;
				vscode.window.showInformationMessage(`Selected file will be included in the process.`);
			} else {
				vscode.window.showWarningMessage(`Selected file will not be included.`);
			}
			CURRENT_DIR_PATH = path.resolve(path.dirname(uri.fsPath));
		}

		const options: { [key: string]: (context: vscode.ExtensionContext) => Promise<void> } = {
			setApiEndpointAction,
			uploadTemplateAction,
			downloadTemplateAction,
		};
		const quickPick = vscode.window.createQuickPick();
		quickPick.items = Object.keys(options).map(label => ({ label }));
		quickPick.onDidChangeSelection(selection => {
			if (selection[0]) {
				options[selection[0].label](context)
					.catch(console.error);
			}
		});
		quickPick.onDidHide(() => quickPick.dispose());
		quickPick.show();
	}));

}

export function deactivate() { }
