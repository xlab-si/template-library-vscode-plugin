import { OpenDialogOptions, window, QuickInputButton, ExtensionContext, ThemeIcon, Uri } from 'vscode';

import * as restApi from './rest-api-calls';
import { MultiStepInput } from './helpers';
import { CURRENTLY_SELECTED_FILE } from './extension';

export async function uploadTemplateInteractiveAction(context: ExtensionContext) {

    class MyButton implements QuickInputButton {
        constructor(public iconPath: ThemeIcon, public tooltip: string) { }
    }

    const backButton = new MyButton(new ThemeIcon("debug-reverse-continue"), 'Back');

    interface CreateTemplateState {
        currentUser: string,
        templateName: string;
        description: string;
        templateTypeName: string;
        publicAccess: boolean;
        versionName: string;
        readmeFile: string;
        templateFile: string;
    }

    const pickActionTitle = 'Pick your desired template action';
    const createTemplateTitle = 'Create a new template';
    const createTemplateVersionTitle = 'Create a new template version';

    async function collectInputs() {
        const state = {} as Partial<CreateTemplateState>;
        await MultiStepInput.run(input => pickCreateTemplateAction(input, state));
        return state as CreateTemplateState;
    }

    async function pickCreateTemplateAction(input: MultiStepInput, state: Partial<CreateTemplateState>): Promise<any> {
        let pickActionOptions = ['create a whole new template', 'create just a new template version'].map(label => ({ label }));

        let pick = await input.showQuickPick({
            title: pickActionTitle,
            step: 1,
            totalSteps: 1,
            placeholder: 'Pick the desired action',
            items: pickActionOptions,
            activeItem: pickActionOptions[0],
            shouldResume: shouldResume
        });

        if (pick === pickActionOptions[0]) {
            return (input: MultiStepInput) => inputTemplateName(input, state);
        } else {
            return (input: MultiStepInput) => inputTemplateNameForVersion(input, state);
        }
    }

    async function inputTemplateNameForVersion(input: MultiStepInput, state: Partial<CreateTemplateState>): Promise<any> {
        let pick = await input.showInputBox({
            title: createTemplateVersionTitle,
            step: 0,
            totalSteps: 4,
            value: state.templateName || '',
            prompt: 'Type in the template name to create version for',
            buttons: [backButton],
            validate: validateEmpty,
            shouldResume: shouldResume
        });

        if (pick instanceof MyButton) {
            return (input: MultiStepInput) => pickCreateTemplateAction(input, state);
        }

        state.templateName = pick;
        return (input: MultiStepInput) => inputVersionName(input, state);
    }

    async function inputTemplateName(input: MultiStepInput, state: Partial<CreateTemplateState>): Promise<any> {
        let pick = await input.showInputBox({
            title: createTemplateTitle,
            step: 1,
            totalSteps: 4,
            value: state.templateName || '',
            prompt: 'Template name',
            buttons: [backButton],
            validate: validateEmpty,
            shouldResume: shouldResume
        });

        if (pick instanceof MyButton) {
            return (input: MultiStepInput) => pickCreateTemplateAction(input, state);
        }

        state.templateName = pick;
        return (input: MultiStepInput) => inputDescription(input, state);
    }

    async function inputDescription(input: MultiStepInput, state: Partial<CreateTemplateState>): Promise<any> {
        let pick = await input.showInputBox({
            title: createTemplateTitle,
            step: 2,
            totalSteps: 4,
            value: state.description || '',
            prompt: 'Template description',
            buttons: [backButton],
            validate: validateEmpty,
            shouldResume: shouldResume
        });


        if (pick instanceof MyButton) {
            return (input: MultiStepInput) => inputTemplateName(input, state);
        }

        state.description = pick;
        return (input: MultiStepInput) => pickTemplateType(input, state);
    }

    async function pickTemplateType(input: MultiStepInput, state: Partial<CreateTemplateState>): Promise<any> {
        let templateTypesResponse = await restApi.getTemplateTypes();

        if (templateTypesResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(templateTypesResponse.status)) {
            const templateTypes: Array<Object> = templateTypesResponse.data;
            const templateTypeNames = templateTypes.map((templateType: any) => templateType.name).map(label => ({ label }));

            let templateTypeNamePick = await input.showQuickPick({
                title: createTemplateTitle,
                step: 3,
                totalSteps: 4,
                placeholder: 'Pick a template type',
                items: templateTypeNames,
                activeItem: templateTypeNames[0],
                buttons: [backButton],
                shouldResume: shouldResume
            });

            if (templateTypeNamePick instanceof MyButton) {
                return (input: MultiStepInput) => inputDescription(input, state);
            }

            state.templateTypeName = templateTypeNamePick!!.label;
            return (input: MultiStepInput) => pickPublicAccess(input, state);
        } else {
            if (templateTypesResponse) {
                window.showErrorMessage(templateTypesResponse.data);
            } else {
                window.showErrorMessage('There was an error when retrieving template types.');
            }
            return;
        }
    }

    async function pickPublicAccess(input: MultiStepInput, state: Partial<CreateTemplateState>): Promise<any> {
        let publicAccessOptions = ['true', 'false'].map(label => ({ label }));

        let publicAccessPick = await input.showQuickPick({
            title: createTemplateTitle,
            step: 4,
            totalSteps: 4,
            placeholder: 'Do you want your template to be publicly accessible?',
            items: publicAccessOptions,
            activeItem: publicAccessOptions[0],
            buttons: [backButton],
            shouldResume: shouldResume
        });

        if (publicAccessPick instanceof MyButton) {
            return (input: MultiStepInput) => pickTemplateType(input, state);
        }

        state.publicAccess = publicAccessPick!!.label === 'true';

        let postTemplateResponse = await restApi.postTemplate(state.templateName!!, state.description!!, state.templateTypeName!!, state.publicAccess!!);

        if (postTemplateResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(postTemplateResponse.status)) {
            window.showInformationMessage(`Template '${state.templateName}' was added successfully!`);
            return (input: MultiStepInput) => inputVersionName(input, state);
        } else {
            if (postTemplateResponse) {
                window.showErrorMessage(postTemplateResponse.data);
            } else {
                window.showErrorMessage("Adding template has failed! Please try again.");
            }
            return (input: MultiStepInput) => inputTemplateName(input, state);
        }
    }

    async function inputVersionName(input: MultiStepInput, state: Partial<CreateTemplateState>): Promise<any> {
        state.versionName = await input.showInputBox({
            title: createTemplateVersionTitle,
            step: 1,
            totalSteps: 4,
            value: state.versionName || '',
            prompt: 'Version name',
            validate: validateEmpty,
            shouldResume: shouldResume
        });
        return (input: MultiStepInput) => pickReadmeFile(input, state);
    }

    async function pickReadmeFile(input: MultiStepInput, state: Partial<CreateTemplateState>): Promise<any> {
        let pickReadmeFileOptions = ['send empty', 'pick from filesystem'].map(label => ({ label }));

        let pick = await input.showQuickPick({
            title: createTemplateVersionTitle,
            step: 2,
            totalSteps: 4,
            placeholder: 'Pick a README file',
            items: pickReadmeFileOptions,
            activeItem: pickReadmeFileOptions[0],
            buttons: [backButton],
            shouldResume: shouldResume
        });

        if (pick instanceof MyButton) {
            return (input: MultiStepInput) => inputVersionName(input, state);
        }

        if (pick === pickReadmeFileOptions[0]) {
            state.readmeFile = undefined;
        } else {
            const options: OpenDialogOptions = {
                title: createTemplateVersionTitle,
                defaultUri: Uri.file("/projects"),
                canSelectMany: false,
                canSelectFolders: false,
                canSelectFiles: true,
                openLabel: 'Open',
                filters: {
                    'README files': ['md']
                }
            };

            await window.showOpenDialog(options).then(fileUri => {
                if (fileUri && fileUri[0]) {
                    console.log('Selected readme file: ' + fileUri[0].fsPath);
                    state.readmeFile = fileUri[0].fsPath;
                }
            });
        }

        return (input: MultiStepInput) => pickTemplateFile(input, state);
    }

    async function pickTemplateFile(input: MultiStepInput, state: Partial<CreateTemplateState>): Promise<any> {
        let templateFileOptions = [];
        if (CURRENTLY_SELECTED_FILE) {
            templateFileOptions.push(`pick selected: ${CURRENTLY_SELECTED_FILE}`);
        }
        templateFileOptions.push('pick from filesystem');

        let pickTemplateFileOptions = templateFileOptions.map(label => ({ label }));

        let pick = await input.showQuickPick({
            title: createTemplateVersionTitle,
            step: 3,
            totalSteps: 4,
            placeholder: 'Pick a template file',
            items: pickTemplateFileOptions,
            activeItem: pickTemplateFileOptions[2],
            buttons: [backButton],
            shouldResume: shouldResume
        });


        if (pick instanceof MyButton) {
            return (input: MultiStepInput) => pickReadmeFile(input, state);
        }

        if (pickTemplateFileOptions.length === 2 && pick === pickTemplateFileOptions[0]) {
            state.templateFile = CURRENTLY_SELECTED_FILE;
        } else {
            const options: OpenDialogOptions = {
                title: createTemplateVersionTitle,
                defaultUri: Uri.file("/projects"),
                canSelectMany: false,
                canSelectFolders: false,
                canSelectFiles: true,
                openLabel: 'Open',
                filters: {
                    'CSAR': ['csar', 'zip', 'tar', 'rar', 'gz', 'tgz'],
                    'TOSCA template files': ['yml', 'yaml', 'tosca']
                }
            };

            await window.showOpenDialog(options).then(fileUri => {
                if (fileUri && fileUri[0]) {
                    console.log('Selected template file: ' + fileUri[0].fsPath);
                    state.templateFile = fileUri[0].fsPath;
                }
            });
        }

        let postVersionResponse = await restApi.postVersion(state.templateName!, state.versionName!, state.templateFile!, state.readmeFile!);

        if (postVersionResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(postVersionResponse.status)) {
            window.showInformationMessage(`New version '${state.versionName}' for template '${state.templateName}' was successfully inserted!`);
            return;
        } else {
            if (postVersionResponse) {
                window.showErrorMessage(postVersionResponse.data);
            } else {
                window.showErrorMessage("Adding a version has failed! Please try again.");
            }
            return (input: MultiStepInput) => inputVersionName(input, state);
        }
    }

    function shouldResume() {
        return new Promise<boolean>((resolve, reject) => {
        });
    }

    async function validateEmpty(value: string) {
        return value === '' ? 'Emtpy value is not allowed' : undefined;
    }

    const state = await collectInputs();
    window.showInformationMessage('Template library interactive action has finished.');
}
