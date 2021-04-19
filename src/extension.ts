import { commands, window, ExtensionContext, Uri } from 'vscode';
import * as path from 'path';

import { authenticate, deleteLoginInfo } from './helpers';
import { configAction } from './config-actions';
import { setApiEndpointAction } from './set-api-endpoint-action';
import { uploadTemplateInteractiveAction } from './upload-template-interactive-action';
import { downloadTemplateInteractiveAction } from './download-template-interactive-action';
import { lstatSync } from 'fs';

export let CURRENTLY_SELECTED_FILE: string;
export let CURRENT_DIR_PATH: string;

export async function activate(context: ExtensionContext) {
	context.subscriptions.push(commands.registerCommand('template-library.set-api-endpoint', async (uri?: Uri) => {
		await setApiEndpointAction(context);
	}));

	context.subscriptions.push(commands.registerCommand('template-library.config-actions', async (uri?: Uri) => {
		if (uri) {
			CURRENTLY_SELECTED_FILE = '';
			CURRENT_DIR_PATH = '';
			window.showInformationMessage(`Selected file is: ${uri.fsPath}`);
			let fileExtension = uri.fsPath.split('.').pop();
			if (fileExtension!! === 'json') {
				CURRENTLY_SELECTED_FILE = uri.fsPath;
				window.showInformationMessage(`Selected file will be included in the process.`);
			} else {
				window.showWarningMessage(`Selected file will not be included.`);
			}
			CURRENT_DIR_PATH = path.resolve(path.dirname(uri.fsPath));
		}

		await authenticate(context);
		await configAction(context);
	}));

	context.subscriptions.push(commands.registerCommand('template-library.interactive-actions', async (uri?: Uri) => {
		if (uri) {
			CURRENTLY_SELECTED_FILE = '';
			CURRENT_DIR_PATH = '';
			window.showInformationMessage(`Selected file is: ${uri.fsPath}`);
			let fileExtension = uri.fsPath.split('.').pop();
			let isDir = lstatSync(uri.fsPath).isDirectory();
			if (['csar', 'zip', 'tar', 'rar', 'gz', 'tgz', 'yml', 'yaml', 'tosca'].includes(fileExtension!!) || isDir) {
				CURRENTLY_SELECTED_FILE = uri.fsPath;
				window.showInformationMessage(`Selected file will be included in the process.`);
			} else {
				window.showWarningMessage(`Selected file will not be included.`);
			}
			CURRENT_DIR_PATH = path.resolve(path.dirname(uri.fsPath));
		}

		await authenticate(context);
		const options: { [key: string]: (context: ExtensionContext) => Promise<void> } = {
			uploadTemplateInteractiveAction,
			downloadTemplateInteractiveAction,
		};
		const quickPick = window.createQuickPick();
		quickPick.items = Object.keys(options).map(label => ({ label }));
		quickPick.ignoreFocusOut = true;
		quickPick.canSelectMany = false;
		quickPick.onDidChangeSelection(selection => {
			if (selection[0]) {
				options[selection[0].label](context)
					.catch(console.error);
			}
		});
		quickPick.onDidHide(() => quickPick.dispose());
		quickPick.show();
	}));

    context.subscriptions.push(commands.registerCommand("template-library.delete-login-info", async () => {
        await deleteLoginInfo(context.workspaceState);
		window.showInformationMessage("Login info deleted.");
	}));
}

export function deactivate() { }
