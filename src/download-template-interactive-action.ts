import { window, QuickInputButton, ExtensionContext, ThemeIcon } from 'vscode';
import * as fs from 'fs';

import * as restApi from './rest-api-calls';
import { MultiStepInput } from './helpers';
import { CURRENT_DIR_PATH } from './extension';

export async function downloadTemplateAction(context: ExtensionContext) {

    class MyButton implements QuickInputButton {
        constructor(public iconPath: ThemeIcon, public tooltip: string) { }
    }

    const backButton = new MyButton(new ThemeIcon("debug-reverse-continue"), 'Back');

    interface DownloadTemplateState {
        templateName: string;
        versionName: string;
        filesDestination: string;
    }

    const downloadTemplateTitle = 'Download template files';

    async function collectInputs() {
        const state = {} as Partial<DownloadTemplateState>;
        await MultiStepInput.run(input => pickTemplateName(input, state));
        return state as DownloadTemplateState;
    }

    async function pickTemplateName(input: MultiStepInput, state: Partial<DownloadTemplateState>): Promise<any> {
        let templatesResponse = await restApi.getTemplates();

        if (templatesResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(templatesResponse.status)) {
            const templates: Array<Object> = templatesResponse.data;
            const templateNames = templates.map((template: any) => template.name).map(label => ({ label }));

            let templateNamePick = await input.showQuickPick({
                title: downloadTemplateTitle,
                step: 1,
                totalSteps: 3,
                placeholder: 'Pick an existing template',
                items: templateNames,
                activeItem: templateNames[0],
                shouldResume: shouldResume
            });

            state.templateName = templateNamePick!!.label;
            return (input: MultiStepInput) => pickVersionName(input, state);
        } else {
            if (templatesResponse) {
                window.showErrorMessage(templatesResponse.data);
            } else {
                window.showErrorMessage('There was an error when retrieving templates.');
            }
            return;
        }
    }

    async function pickVersionName(input: MultiStepInput, state: Partial<DownloadTemplateState>): Promise<any> {
        let versionsResponse = await restApi.getTemplateVersions(state.templateName!!);

        if (versionsResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(versionsResponse.status)) {
            const versions: Array<Object> = versionsResponse.data;
            const versionNames = versions.map((version: any) => version.versionName).map(label => ({ label }));

            let templateVersionNamePick = await input.showQuickPick({
                title: downloadTemplateTitle,
                step: 2,
                totalSteps: 3,
                placeholder: 'Pick an existing template version',
                items: versionNames,
                activeItem: versionNames[0],
                buttons: [backButton],
                shouldResume: shouldResume
            });

            if (templateVersionNamePick instanceof MyButton) {
                return (input: MultiStepInput) => pickTemplateName(input, state);
            }
            state.versionName = templateVersionNamePick!!.label;
            return (input: MultiStepInput) => inputDestinationFolder(input, state);
        } else {
            if (versionsResponse) {
                window.showErrorMessage(versionsResponse.data);
            } else {
                window.showErrorMessage('There was an error when retrieving template versions.');
            }
            return;
        }
    }

    async function inputDestinationFolder(input: MultiStepInput, state: Partial<DownloadTemplateState>): Promise<any> {
        let destinationPath = `./${state.templateName}`;
        if (CURRENT_DIR_PATH) {
            destinationPath = `${CURRENT_DIR_PATH}/${state.templateName}`;;
        }

        let destinationFolderInput = await input.showInputBox({
            title: downloadTemplateTitle,
            step: 3,
            totalSteps: 3,
            value: destinationPath || '',
            prompt: 'Type in a path where template version files will be downloaded to',
            buttons: [backButton],
            shouldResume: shouldResume,
            validate: validateEmpty
        });

        if (destinationFolderInput instanceof MyButton) {
            return (input: MultiStepInput) => pickVersionName(input, state);
        }

        state.filesDestination = destinationFolderInput;
        let templateVersionFilesResponse = await restApi.getTemplateVersionFiles(state.templateName!!, state.versionName!, state.filesDestination!!);

        if (templateVersionFilesResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(templateVersionFilesResponse.status)) {
            window.showInformationMessage(`Template '${state.templateName}' was downloaded successfully to '${state.filesDestination}'!`);
            return;
        } else {
            if (templateVersionFilesResponse) {
                window.showErrorMessage(templateVersionFilesResponse.data);
            } else {
                window.showErrorMessage("Downloading template version files has failed! Please try again.");
            }
            return pickTemplateName(input, state);
        }
    }

    function getDirectories(path: string) {
        return fs.readdirSync(path).filter(function (file) {
            return fs.statSync(path + '/' + file).isDirectory();
        });
    }

    function shouldResume() {
        return new Promise<boolean>((resolve, reject) => {
        });
    }

    async function validateEmpty(value: string) {
        return value === '' ? 'Emtpy value is not allowed' : undefined;
    }

    async function validatePath(value: string) {
        if (value === '') {
            return 'Emtpy value is not allowed';
        }

        if (await !fileExists(value)) {
            return `Path '${value}' does not exist! Try again.`;
        } else {
            if (await isDirectory(value)) {
                return `Path '${value}' is a directory! Please provide file name too.`;
            }
        }
        return undefined;
    }

    async function fileExists(path: string) {
        return fs.stat(path, (exists) => {
            if (exists === null) {
                return true;
            } else if (exists.code === 'ENOENT') {
                return false;
            }
        });
    }

    async function isDirectory(path: string) {
        var stat = fs.lstatSync(path);
        return stat.isDirectory;
    }

    const state = await collectInputs();
    window.showInformationMessage('Template library interactive action has finished.');
}
