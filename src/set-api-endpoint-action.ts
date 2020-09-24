import { window, ExtensionContext } from 'vscode';

import { MultiStepInput } from './helpers';
import * as restApi from './rest-api-calls';

export async function setApiEndpointAction(context: ExtensionContext) {
    const title = 'Set REST API endpoint';

    async function inputRestApiUrl(input: MultiStepInput) {
        let newEndpoint = await input.showInputBox({
            title: title,
            step: 1,
            totalSteps: 1,
            value: restApi.REST_API_ENDPOINT || '',
            prompt: 'Modify Template library REST API endpoint',
            validate: validateURL,
            shouldResume: shouldResume
        });

        await restApi.configureApiEndpoint(newEndpoint);
        window.showInformationMessage(`REST API URL is set to: ${newEndpoint}.`);
    }

    function shouldResume() {
        return new Promise<boolean>((resolve, reject) => {
        });
    }

    async function validateURL(value: string) {
        if (value === '') {
            return 'Emtpy value is not allowed';
        }

        if (!isValidURL(value)) {
            return 'Invalid URL!';
        }
        return undefined;
    }

    function isValidURL(url: string) {
        var pattern = new RegExp('^(https?:\\/\\/)?' +
            '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' +
            '((\\d{1,3}\\.){3}\\d{1,3}))' +
            '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' +
            '(\\?[;&a-z\\d%_.~+=-]*)?' +
            '(\\#[-a-z\\d_]*)?$', 'i');
        return !!pattern.test(url);
    }

    await MultiStepInput.run(input => inputRestApiUrl(input));
    window.showInformationMessage('Template library action has finished.');
}
