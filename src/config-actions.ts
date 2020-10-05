import { OpenDialogOptions, window, QuickInputButton, ExtensionContext, ThemeIcon, Uri } from 'vscode';
import { join } from 'path';
import * as fs from 'fs';

import * as restApi from './rest-api-calls';
import { MultiStepInput } from './helpers';
import { CURRENTLY_SELECTED_FILE, CURRENT_DIR_PATH } from './extension';
import { strict } from 'assert';
import { stringify } from 'querystring';

export async function configAction(context: ExtensionContext) {

    class MyButton implements QuickInputButton {
        constructor(public iconPath: ThemeIcon, public tooltip: string) { }
    }

    const backButton = new MyButton(new ThemeIcon("debug-reverse-continue"), 'Back');

    let configFile: string;

    interface CreateTemplateState {
        templateName: string;
        description: string;
        templateTypeName: string;
        publicAccess: boolean;
        versionName: string;
        readmeFile: string;
        templateFile: string;
        implementationFiles: string[];
    }


    interface DownloadTemplateState {
        templateName: string;
        versionName: string;
        filesDestination: string;
    }

    const createTemplateVersionTitle = 'Create a new template and/or its version';

    async function collectInputs() {
        const uploadState = {} as Partial<CreateTemplateState>;
        const downloadState = {} as Partial<DownloadTemplateState>;
        await MultiStepInput.run(input => pickConfigFile(input, uploadState, downloadState));
        let result: [CreateTemplateState, DownloadTemplateState] = [uploadState as CreateTemplateState, downloadState as DownloadTemplateState];
        return result;
    }

    async function pickConfigFile(input: MultiStepInput, uploadState: Partial<CreateTemplateState>, downloadState: Partial<DownloadTemplateState>): Promise<any> {
        let templateFileOptions = [];
        if (CURRENTLY_SELECTED_FILE) {
            templateFileOptions.push(`pick selected: ${CURRENTLY_SELECTED_FILE}`);
        }
        templateFileOptions.push('pick from filesystem');

        let pickTemplateFileOptions = templateFileOptions.map(label => ({ label }));

        let pick = await input.showQuickPick({
            title: createTemplateVersionTitle,
            step: 1,
            totalSteps: 1,
            placeholder: 'Pick a Template library JSON config file',
            items: pickTemplateFileOptions,
            activeItem: pickTemplateFileOptions[2],
            shouldResume: shouldResume
        });

        if (pickTemplateFileOptions.length === 2 && pick === pickTemplateFileOptions[0]) {
            configFile = CURRENTLY_SELECTED_FILE;
        } else {
            const options: OpenDialogOptions = {
                title: createTemplateVersionTitle,
                defaultUri: Uri.file("/projects"),
                canSelectMany: false,
                canSelectFolders: false,
                canSelectFiles: true,
                openLabel: 'Open',
                filters: {
                    'JSON Template library config': ['json'],
                }
            };

            await window.showOpenDialog(options).then(fileUri => {
                if (fileUri && fileUri[0]) {
                    console.log('Selected json config file: ' + fileUri[0].fsPath);
                    configFile = fileUri[0].fsPath;
                }
            });
        }

        await initiateConfigOperations(uploadState, downloadState);
    }

    async function initiateConfigOperations(uploadState: Partial<CreateTemplateState>, downloadState: Partial<DownloadTemplateState>): Promise<any> {
        try {
            let configFileContent = fs.readFileSync(configFile, 'utf8');
            let validateConfig = validateJsonConfig(configFileContent!);

            if (validateConfig) {
                let jsonConfig: JSON = JSON.parse(configFileContent);

                let validateTemplate = validateCreateTemplateJsonConfig(jsonConfig, uploadState);
                let validateVersion = validateCreateVersionJsonConfig(jsonConfig, uploadState);
                let validateDownload = validateDownloadVersionFilesJsonConfig(jsonConfig, downloadState);

                if (validateTemplate[0]) {
                    await intitateCreateTemplateRequest(uploadState);
                } else {
                    if (validateTemplate[1].length !== 0 && validateTemplate[2].length !== 0) {
                        window.showErrorMessage(`JSON config file create template action has missing keys: ${validateTemplate[2]}.`);
                    }
                }

                if (validateVersion[0]) {
                    await intitateCreateVersionRequest(uploadState);
                } else {
                    if (validateVersion[1].length !== 0 && validateVersion[2].length !== 0) {
                        window.showErrorMessage(`JSON config file upload version action has missing keys: ${validateVersion[2]}.`);
                    }
                }

                if (validateDownload[0]) {
                    await intitateDownloadTemplateVersionFilesRequest(downloadState);
                } else {
                    if (validateDownload[1].length !== 0 && validateDownload[2].length !== 0) {
                        window.showErrorMessage(`JSON config file download template action has missing keys: ${validateDownload[2]}.`);
                    }
                }

                return;
            } else {
                window.showErrorMessage("There was an error when reading JSON config file.");
                return;
            }
        } catch (e) {
            window.showErrorMessage("There was an error when reading JSON config file.");
        }
    }

    async function intitateCreateTemplateRequest(uploadState: Partial<CreateTemplateState>) {
        let postTemplateResponse = await restApi.postTemplate(uploadState.templateName!, uploadState.description!, uploadState.templateTypeName!, uploadState.publicAccess!);

        if (postTemplateResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(postTemplateResponse.status)) {
            window.showInformationMessage(`Template '${uploadState.templateName}' was added successfully!`);
        } else {
            if (postTemplateResponse) {
                window.showErrorMessage(postTemplateResponse.data);
            } else {
                window.showErrorMessage("Adding template has failed! Please try again.");
            }
            return (input: MultiStepInput) => pickConfigFile(input, uploadState, downloadState);
        }
    }

    async function intitateCreateVersionRequest(uploadState: Partial<CreateTemplateState>) {
        let postVersionResponse = await restApi.postVersion(uploadState.templateName!, uploadState.versionName!, uploadState.templateFile!, uploadState.readmeFile!, uploadState.implementationFiles!);

        if (postVersionResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(postVersionResponse.status)) {
            window.showInformationMessage(`New version '${uploadState.versionName}' for template '${uploadState.templateName}' was successfully inserted!`);
        } else {
            if (postVersionResponse) {
                window.showErrorMessage(postVersionResponse.data);
            } else {
                window.showErrorMessage("Adding a version has failed! Please try again.");
            }
            return (input: MultiStepInput) => pickConfigFile(input, uploadState, downloadState);
        }
    }

    async function intitateDownloadTemplateVersionFilesRequest(downloadState: Partial<DownloadTemplateState>) {
        let templateVersionFilesResponse = await restApi.getTemplateVersionFiles(downloadState.templateName!, downloadState.versionName!, downloadState.filesDestination!);

        if (templateVersionFilesResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(templateVersionFilesResponse.status)) {
            window.showInformationMessage(`Template '${downloadState.templateName}' was downloaded successfully to '${downloadState.filesDestination}'!`);
            return;
        } else {
            if (templateVersionFilesResponse?.data) {
                let data = templateVersionFilesResponse.data;
                if (data instanceof String) {
                    window.showErrorMessage(data as string);
                } else {
                    window.showErrorMessage("Downloading template version files has failed! Please try again.");
                }
            } else {
                window.showErrorMessage("Downloading template version files has failed! Please try again.");
            }
            return (input: MultiStepInput) => pickConfigFile(input, uploadState, downloadState);
        }
    }

    function validateJsonConfig(jsonConfigInput: string): boolean {
        try {
            JSON.parse(jsonConfigInput);
            return true;
        } catch (e) {
            return false;
        }
    }

    function validateCreateTemplateJsonConfig(jsonConfig: JSON, uploadState: Partial<CreateTemplateState>): [boolean, string[], string[]] {
        let presentKeys: string[] = [];
        let absentKeys: string[] = [];

        try {
            let returnValue = true;

            if ("upload_template_name" in jsonConfig) {
                presentKeys.push("upload_template_name");
                uploadState.templateName = jsonConfig["upload_template_name"];
            } else {
                absentKeys.push("upload_template_name");
                returnValue = false;
            }

            if ("upload_template_description" in jsonConfig) {
                presentKeys.push("upload_template_description");
                uploadState.description = jsonConfig["upload_template_description"];
            } else {
                absentKeys.push("upload_template_description");
                returnValue = false;
            }

            if ("upload_template_type_name" in jsonConfig) {
                presentKeys.push("upload_template_type_name");
                uploadState.templateTypeName = jsonConfig["upload_template_type_name"];
            } else {
                absentKeys.push("upload_template_type_name");
                returnValue = false;
            }

            if ("upload_public_access" in jsonConfig) {
                presentKeys.push("upload_public_access");
                uploadState.publicAccess = jsonConfig["upload_public_access"];
            } else {
                absentKeys.push("upload_public_access");
                returnValue = false;
            }

            return [returnValue, presentKeys, absentKeys];
        } catch (e) {
            window.showErrorMessage("There was an error when reading JSON config file.");
            return [false, presentKeys, absentKeys];
        }
    }

    function validateCreateVersionJsonConfig(jsonConfig: JSON, uploadState: Partial<CreateTemplateState>): [boolean, string[], string[]] {
        let presentKeys: string[] = [];
        let absentKeys: string[] = [];

        try {
            let returnValue = true;

            if ("upload_version_name" in jsonConfig) {
                presentKeys.push("upload_version_name");
                uploadState.versionName = jsonConfig["upload_version_name"];
            } else {
                absentKeys.push("upload_version_name");
                returnValue = false;
            }

            if ("upload_readme_file" in jsonConfig) {
                presentKeys.push("upload_readme_file");
                let readmeFilePath = join(CURRENT_DIR_PATH, jsonConfig["upload_readme_file"]);
                if (fileExists(readmeFilePath)) {
                    uploadState.readmeFile = readmeFilePath;
                } else {
                    window.showErrorMessage(`File path '${readmeFilePath}' from key 'upload_readme_file' does not exist.`);
                    returnValue = false;
                }
            } else {
                absentKeys.push("upload_readme_file");
            }

            if ("upload_template_file" in jsonConfig) {
                presentKeys.push("upload_template_file");
                let templateFilePath = join(CURRENT_DIR_PATH, jsonConfig["upload_template_file"]);
                if (fileExists(templateFilePath)) {
                    uploadState.templateFile = templateFilePath;
                } else {
                    window.showErrorMessage(`File path '${templateFilePath}' from key 'upload_template_file' does not exist.`);
                    returnValue = false;
                }
            } else {
                absentKeys.push("upload_template_file");
                returnValue = false;
            }

            if ("upload_implementation_files" in jsonConfig) {
                presentKeys.push("upload_implementation_files");
                if (Array.isArray(jsonConfig["upload_implementation_files"])) {
                    let implementationFiles: Array<string> = jsonConfig["upload_implementation_files"];
                    let updatedImplementationFiles: string[] = [];
                    for (let file of implementationFiles) {
                        let implementationFilePath = join(CURRENT_DIR_PATH, file);

                        if (fileExists(implementationFilePath)) {
                            updatedImplementationFiles.push(join(CURRENT_DIR_PATH, file));
                        } else {
                            window.showErrorMessage(`File path '${implementationFilePath}' from key 'upload_implementation_files' does not exist.`);
                            returnValue = false;
                        }
                    }
                    uploadState.implementationFiles = updatedImplementationFiles;
                } else {
                    window.showErrorMessage(`Key 'upload_implementation_files' should be an array.`);
                    returnValue = false;
                }
            } else {
                absentKeys.push("upload_implementation_files");
            }

            return [returnValue, presentKeys, absentKeys];
        } catch (e) {
            window.showErrorMessage("There was an error when reading JSON config file.");
            return [false, presentKeys, absentKeys];
        }
    }

    function validateDownloadVersionFilesJsonConfig(jsonConfig: JSON, downloadState: Partial<DownloadTemplateState>): [boolean, string[], string[]] {
        let presentKeys: string[] = [];
        let absentKeys: string[] = [];

        try {
            let returnValue = true;

            if ("download_template_name" in jsonConfig) {
                presentKeys.push("download_template_name");
                downloadState.templateName = jsonConfig["download_template_name"];
            } else {
                absentKeys.push("download_template_name");
                returnValue = false;
            }

            if ("download_version_name" in jsonConfig) {
                presentKeys.push("download_version_name");
                downloadState.versionName = jsonConfig["download_version_name"];
            } else {
                absentKeys.push("download_version_name");
                returnValue = false;
            }

            if ("download_path" in jsonConfig) {
                presentKeys.push("download_path");
                let downloadFilePath = join(CURRENT_DIR_PATH, jsonConfig["download_path"]);

                if (fileExists(downloadFilePath)) {
                    window.showErrorMessage(`File path '${downloadFilePath}' from key 'download_path' already exists. Please pick a new one.`);
                    returnValue = false;
                } else {
                    downloadState.filesDestination = downloadFilePath;
                }
            } else {
                absentKeys.push("download_version_name");
                returnValue = false;
            }

            return [returnValue, presentKeys, absentKeys];
        } catch (e) {
            window.showErrorMessage("There was an error when reading JSON config file.");
            return [false, presentKeys, absentKeys];
        }
    }

    function shouldResume() {
        return new Promise<boolean>((resolve, reject) => {
        });
    }

    function fileExists(path: string): boolean {
        if (fs.existsSync(path)) {
            console.log(path);
            return true;
        } else {
            return false;
        }
    }

    const result = await collectInputs();
    const uploadState = result[0];
    const downloadState = result[1];
    window.showInformationMessage('Template library config action has finished.');
}
