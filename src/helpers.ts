// helper class was used from: https://github.com/microsoft/vscode-extension-samples/blob/master/quickinput-sample/src/multiStepInput.ts

import { QuickPickItem, window, Disposable, QuickInputButton, QuickInput, QuickInputButtons, ThemeIcon, ExtensionContext } from 'vscode';

import * as restApi from './rest-api-calls';

export class InputFlowAction {
    static back = new InputFlowAction();
    static cancel = new InputFlowAction();
    static resume = new InputFlowAction();
}

export type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

export interface QuickPickParameters<T extends QuickPickItem> {
    title: string;
    step: number;
    totalSteps: number;
    items: T[];
    activeItem?: T;
    placeholder: string;
    buttons?: QuickInputButton[];
    shouldResume: () => Thenable<boolean>;
}

export interface InputBoxParameters {
    title: string;
    step: number;
    totalSteps: number;
    value: string;
    prompt: string;
    validate: (value: string) => Promise<string | undefined>;
    buttons?: QuickInputButton[];
    shouldResume: () => Thenable<boolean>;
}

export class MultiStepInput {

    static async run<T>(start: InputStep) {
        const input = new MultiStepInput();
        return input.stepThrough(start);
    }

    private current?: QuickInput;
    private steps: InputStep[] = [];

    private async stepThrough<T>(start: InputStep) {
        let step: InputStep | void = start;
        while (step) {
            this.steps.push(step);
            if (this.current) {
                this.current.enabled = false;
                this.current.busy = true;
            }
            try {
                step = await step(this);
            } catch (err) {
                if (err === InputFlowAction.back) {
                    this.steps.pop();
                    step = this.steps.pop();
                } else if (err === InputFlowAction.resume) {
                    step = this.steps.pop();
                } else if (err === InputFlowAction.cancel) {
                    step = undefined;
                } else {
                    throw err;
                }
            }
        }
        if (this.current) {
            this.current.dispose();
        }
    }

    async showQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P, selectMultiple?: boolean) {
        const disposables: Disposable[] = [];
        try {
            return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
                const input = window.createQuickPick<T>();
                input.title = title;
                input.step = step;
                input.totalSteps = totalSteps;
                input.placeholder = placeholder;
                input.items = items;
                input.ignoreFocusOut = true;
                if (selectMultiple) {
                    input.canSelectMany = true;
                }
                if (activeItem) {
                    input.activeItems = [activeItem];
                }
                input.buttons = [
                    ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
                    ...(buttons || [])
                ];
                disposables.push(
                    input.onDidTriggerButton(item => {
                        if (item === QuickInputButtons.Back) {
                            reject(InputFlowAction.back);
                        } else {
                            resolve(<any>item);
                        }
                    }),
                    input.onDidChangeSelection(items => resolve(items[0])),
                    input.onDidHide(() => {
                        (async () => {
                            reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
                        })()
                            .catch(reject);
                    })
                );
                if (this.current) {
                    this.current.dispose();
                }
                this.current = input;
                this.current.show();
            });
        } finally {
            disposables.forEach(d => d.dispose());
        }
    }

    async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, shouldResume }: P, password?: boolean) {
        const disposables: Disposable[] = [];
        try {
            return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
                const input = window.createInputBox();
                input.title = title;
                input.step = step;
                input.totalSteps = totalSteps;
                input.value = value || '';
                if (password) {
                    input.password = password;
                }
                input.ignoreFocusOut = true;
                input.prompt = prompt;
                input.buttons = [
                    ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
                    ...(buttons || [])
                ];
                let validating = validate('');
                disposables.push(
                    input.onDidTriggerButton(item => {
                        if (item === QuickInputButtons.Back) {
                            reject(InputFlowAction.back);
                        } else {
                            resolve(<any>item);
                        }
                    }),
                    input.onDidAccept(async () => {
                        const value = input.value;
                        input.enabled = false;
                        input.busy = true;
                        if (!(await validate(value))) {
                            resolve(value);
                        }
                        input.enabled = true;
                        input.busy = false;
                    }),
                    input.onDidChangeValue(async text => {
                        const current = validate(text);
                        validating = current;
                        const validationMessage = await current;
                        if (current === validating) {
                            input.validationMessage = validationMessage;
                        }
                    }),
                    input.onDidHide(() => {
                        (async () => {
                            reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
                        })()
                            .catch(reject);
                    })
                );
                if (this.current) {
                    this.current.dispose();
                }
                this.current = input;
                this.current.show();
            });
        } finally {
            disposables.forEach(d => d.dispose());
        }
    }
}


export async function authenticate(context: ExtensionContext) {
    const loginTitle = 'Login to Template library';

    class MyButton implements QuickInputButton {
        constructor(public iconPath: ThemeIcon, public tooltip: string) { }
    }

    const backButton = new MyButton(new ThemeIcon("debug-reverse-continue"), 'Back');

    let userName: string = '';

    async function collectInputs() {
        let currentUserResponse = await restApi.getCurrentUser();

        if (currentUserResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(currentUserResponse.status) && currentUserResponse.data instanceof Object) {
            window.showInformationMessage('Native or KeyCloak user was found!');
            return;
        } else {
            if (currentUserResponse) {
                window.showInformationMessage('You will need to login as a KeyCloak or native TPS user!');
                await MultiStepInput.run(input => inputUsername(input));
                return;
            } else {
                window.showErrorMessage('It looks like that Template library REST API is not accessible!');
                return;
            }
        }
    }

    async function inputUsername(input: MultiStepInput): Promise<any> {
        let username = await input.showInputBox({
            title: loginTitle,
            step: 1,
            totalSteps: 2,
            value: userName,
            prompt: 'Username',
            validate: validateEmpty,
            shouldResume: shouldResume
        });

        userName = username;

        return (input: MultiStepInput) => inputPassword(input, username);
    }

    async function inputPassword(input: MultiStepInput, username: string): Promise<any> {
        let password = await input.showInputBox({
            title: loginTitle,
            step: 2,
            totalSteps: 2,
            value: '',
            prompt: 'Password',
            buttons: [backButton],
            validate: validateEmpty,
            shouldResume: shouldResume
        }, true);


        if (password instanceof MyButton) {
            return (input: MultiStepInput) => inputUsername(input);
        }

        let loginResponse = await restApi.postNativeLogin(username, password);
        if (loginResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(loginResponse.status)) {
            window.showInformationMessage('Native login has been successful!');
            return;
        } else {
            if (loginResponse) {
                window.showErrorMessage(loginResponse.data);
            } else {
                window.showErrorMessage('Native TPS login attempt has failed! Please try again.');
            }
            return (input: MultiStepInput) => inputUsername(input);
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
    window.showInformationMessage('Template library login action has finished.');
}
