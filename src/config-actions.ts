import { OpenDialogOptions, window, QuickInputButton, ExtensionContext, ThemeIcon, Uri } from 'vscode';
import { join } from 'path';
import * as fs from 'fs';

import * as restApi from './rest-api-calls';
import { MultiStepInput } from './helpers';
import { CURRENTLY_SELECTED_FILE, CURRENT_DIR_PATH } from './extension';
import { lstatSync } from "fs";
var zipdir = require('zip-local');

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
                    if (!validateVersion[0] && validateTemplate[1].length !== 0 && validateTemplate[2].length !== 0) {
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
        let postVersionResponse = await restApi.postVersion(uploadState.templateName!, uploadState.versionName!, uploadState.templateFile!, uploadState.readmeFile!);

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

            if ("uploadTemplateName" in jsonConfig) {
                presentKeys.push("uploadTemplateName");
                uploadState.templateName = jsonConfig["uploadTemplateName"];
            } else {
                absentKeys.push("uploadTemplateName");
                returnValue = false;
            }

            if ("uploadTemplateDescription" in jsonConfig) {
                presentKeys.push("uploadTemplateDescription");
                uploadState.description = jsonConfig["uploadTemplateDescription"];
            } else {
                absentKeys.push("uploadTemplateDescription");
                returnValue = false;
            }

            if ("uploadTemplateTypeName" in jsonConfig) {
                presentKeys.push("uploadTemplateTypeName");
                uploadState.templateTypeName = jsonConfig["uploadTemplateTypeName"];
            } else {
                absentKeys.push("uploadTemplateTypeName");
                returnValue = false;
            }

            if ("uploadPublicAccess" in jsonConfig) {
                presentKeys.push("uploadPublicAccess");
                uploadState.publicAccess = jsonConfig["uploadPublicAccess"];
            } else {
                absentKeys.push("uploadPublicAccess");
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

            if ("uploadTemplateName" in jsonConfig) {
                presentKeys.push("uploadTemplateName");
                uploadState.templateName = jsonConfig["uploadTemplateName"];
            } else {
                absentKeys.push("uploadTemplateName");
                returnValue = false;
            }

            if ("uploadVersionName" in jsonConfig) {
                presentKeys.push("uploadVersionName");
                uploadState.versionName = jsonConfig["uploadVersionName"];
            } else {
                absentKeys.push("uploadVersionName");
                returnValue = false;
            }

            if ("uploadReadmeFile" in jsonConfig) {
                presentKeys.push("uploadReadmeFile");
                let readmeFilePath = join(CURRENT_DIR_PATH, jsonConfig["uploadReadmeFile"]);
                if (fileExists(readmeFilePath)) {
                    uploadState.readmeFile = readmeFilePath;
                } else {
                    window.showErrorMessage(`File path '${readmeFilePath}' from key 'uploadReadmeFile' does not exist.`);
                    returnValue = false;
                }
            } else {
                absentKeys.push("uploadReadmeFile");
            }

            if ("uploadTemplateFile" in jsonConfig) {
                presentKeys.push("uploadTemplateFile");
                // Add check if template file is dir and zip it to file
                let templateFilePath = join(CURRENT_DIR_PATH, jsonConfig["uploadTemplateFile"]);

                if (lstatSync(templateFilePath).isDirectory()) {
                    var buff = zipdir.sync.zip(templateFilePath).memory();
                    zipdir.sync.zip(templateFilePath).compress().save(templateFilePath + '.zip');
                    uploadState.templateFile = templateFilePath + '.zip';
                } else if (fileExists(templateFilePath)) {
                    uploadState.templateFile = templateFilePath;
                } else {
                    window.showErrorMessage(`File path '${templateFilePath}' from key 'uploadTemplateFile' does not exist.`);
                    returnValue = false;
                }
            } else {
                absentKeys.push("uploadTemplateFile");
                returnValue = false;
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

            if ("downloadTemplateName" in jsonConfig) {
                presentKeys.push("downloadTemplateName");
                downloadState.templateName = jsonConfig["downloadTemplateName"];
            } else {
                absentKeys.push("downloadTemplateName");
                returnValue = false;
            }

            if ("downloadVersionName" in jsonConfig) {
                presentKeys.push("downloadVersionName");
                downloadState.versionName = jsonConfig["downloadVersionName"];
            } else {
                absentKeys.push("downloadVersionName");
                returnValue = false;
            }

            if ("downloadPath" in jsonConfig) {
                presentKeys.push("downloadPath");
                let downloadFilePath = join(CURRENT_DIR_PATH, jsonConfig["downloadPath"]);

                if (fileExists(downloadFilePath)) {
                    window.showErrorMessage(`File path '${downloadFilePath}' from key 'downloadPath' already exists. Please pick a new one.`);
                    returnValue = false;
                } else {
                    downloadState.filesDestination = downloadFilePath;
                }
            } else {
                absentKeys.push("downloadPath");
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
