// helper class was used from: https://github.com/microsoft/vscode-extension-samples/blob/master/quickinput-sample/src/multiStepInput.ts
// KeyCloak auth was inspired by the magician who maintains this repository: https://github.com/radon-h2020/radon-xopera-saas-plugin

import { QuickPickItem, window, Disposable, QuickInputButton, QuickInput, QuickInputButtons, ThemeIcon, ExtensionContext } from 'vscode';
import * as vscode from 'vscode';
import { IncomingMessage } from 'http';
import * as req from 'request';
import { CookieJar, Cookie } from 'tough-cookie';
import { JSDOM } from 'jsdom';

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

    interface AuthProvider {
        href: string,
        text: string
    }

    let cookieJar: CookieJar;
    let doc: Document;
    let saveNeeded = true;
    const authenticationMethodChoices: { [key: string]: AuthProvider | "XLAB" } = {};

    let userName: string = '';
    let chosenAuthProvider: AuthProvider | "XLAB";

    async function performAuthentication() {
        let needsLogin = false;

        let currentUserResponse = await restApi.getCurrentUser();

        if (currentUserResponse === null) {
            window.showErrorMessage('It looks like that Template library REST API is not accessible!');
            console.error('It looks like that Template library REST API is not accessible!');
            process.exit(1);
        }

        console.log("LOGIN STEP 1: check");
        const credsForAuthResponse = await doCookieRequest(
            "GET",
            restApi.REST_API_ENDPOINT + "/users",
            undefined,
            cookieJar
        );

        if (300 <= credsForAuthResponse.statusCode!! && credsForAuthResponse.statusCode!! <= 399) {
            console.log("We've been redirected!");
            needsLogin = true;
        }

        if (400 <= credsForAuthResponse.statusCode!! && credsForAuthResponse.statusCode!! <= 599) {
            console.log("What am I doing!? It looks like that Template library REST API is not accessible!");
            window.showErrorMessage('It looks like that Template library REST API is not accessible!');
            needsLogin = true;
        }

        if (!needsLogin) {
            return;
        }

        console.log("LOGIN STEP 2: request for oidc-radon");
        const redirectedAuthPageResponse = await doCookieRequestFollowRedirects(
            "GET",
            credsForAuthResponse.headers["location"]!!,
            undefined,
            cookieJar
        );

        //@ts-ignore
        doc = new JSDOM(redirectedAuthPageResponse.body).window.document;

        console.log("LOGIN STEP 3: getting auth providers");
        const authProviders = getAuthProviders(doc, credsForAuthResponse.headers["location"]!!);
        if (authProviders.length === 0) {
            authenticationMethodChoices["Log in as an XLAB KeyCloak native user"] = "XLAB";
        } else {
            authenticationMethodChoices["Log in as an XLAB KeyCloak native user"] = "XLAB";
            authProviders.forEach(i => { authenticationMethodChoices[i.text] = i; });
        }

        await MultiStepInput.run(input => pickAuthenticationMethod(input));
        return;
    }

    async function collectAuthInfo() {
        console.log("LOGIN STEP 1: check");
        const credsForAuthResponse = await doCookieRequest(
            "GET",
            restApi.REST_API_ENDPOINT + "/users",
            undefined,
            cookieJar
        );

        if (300 <= credsForAuthResponse.statusCode!! && credsForAuthResponse.statusCode!! <= 399) {
            console.log("We've been redirected!");
        }

        if (400 <= credsForAuthResponse.statusCode!! && credsForAuthResponse.statusCode!! <= 599) {
            console.log("What am I doing!? It looks like that Template library REST API is not accessible!");
            window.showErrorMessage('It looks like that Template library REST API is not accessible!');
        }

        console.log("LOGIN STEP 2: request for oidc-radon");
        const redirectedAuthPageResponse = await doCookieRequestFollowRedirects(
            "GET",
            credsForAuthResponse.headers["location"]!!,
            undefined,
            cookieJar
        );

        //@ts-ignore
        doc = new JSDOM(redirectedAuthPageResponse.body).window.document;
    }

    async function pickAuthenticationMethod(input: MultiStepInput): Promise<any> {
        let pickAuthenticationMethodOptions = Object.keys(authenticationMethodChoices).map(label => ({ label }));

        let chosenAuthOptionKey = await input.showQuickPick({
            title: loginTitle,
            step: 1,
            totalSteps: 3,
            placeholder: 'Pick Template library authentication method',
            items: pickAuthenticationMethodOptions,
            activeItem: pickAuthenticationMethodOptions[0],
            shouldResume: shouldResume
        });

        if (chosenAuthOptionKey === undefined) {
            vscode.window.showInformationMessage("Deployment canceled - no chosen workspace.");
            console.error("Deployment was canceled - no chosen workspace.");
            throw new Error("Deployment was canceled- no chosen workspace.");
        }
        chosenAuthProvider = authenticationMethodChoices[chosenAuthOptionKey.label];

        return (input: MultiStepInput) => inputUsername(input);
    }

    async function inputUsername(input: MultiStepInput): Promise<any> {
        let username = await input.showInputBox({
            title: loginTitle,
            step: 2,
            totalSteps: 3,
            value: userName,
            prompt: 'Username',
            buttons: [backButton],
            validate: validateEmpty,
            shouldResume: shouldResume
        });

        if (username instanceof MyButton) {
            return (input: MultiStepInput) => pickAuthenticationMethod(input);
        }

        userName = username;
        return (input: MultiStepInput) => inputPassword(input, username as string);
    }

    async function inputPassword(input: MultiStepInput, username: string): Promise<any> {
        let password = await input.showInputBox({
            title: loginTitle,
            step: 3,
            totalSteps: 3,
            value: '',
            prompt: 'Password',
            buttons: [backButton],
            validate: validateEmpty,
            shouldResume: shouldResume
        }, true);


        if (password instanceof MyButton) {
            return (input: MultiStepInput) => inputUsername(input);
        }

        if (chosenAuthProvider === "XLAB") {
            console.log("LOGIN STEP 4a: native XLAB KeyCloak login");
            const loginFormSubmitResponse = await doKeycloakLoginPage(cookieJar, doc, userName, password);

            let currentUserResponse = await restApi.getCurrentUser(cookieJar);
            if (currentUserResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(currentUserResponse.status) && currentUserResponse.data instanceof Object) {
                window.showInformationMessage('XLAB KeyCloak Template library login has been successful!');
                return;
            } else {
                console.log(currentUserResponse);
                window.showErrorMessage('XLAB KeyCloak Template library login attempt has failed! Please try again.');
                saveNeeded = false;
                await deleteLoginInfo(context.workspaceState);
                await performAuthentication();
            }
        } else {
            console.log("LOGIN STEP 4b-1: clicking on auth provider button link");
            const secondaryAuthProviderButtonResponse = await doCookieRequestFollowRedirects(
                "GET",
                chosenAuthProvider.href,
                undefined,
                cookieJar
            );

            //@ts-ignore
            const secondaryAuthProviderDoc = new JSDOM(secondaryAuthProviderButtonResponse.body).window.document;
            console.log("LOGIN STEP 4b-2: submitting secondary auth provider login page");
            const secondaryAuthProviderloginFormSubmitResponse = await doKeycloakLoginPage(cookieJar, secondaryAuthProviderDoc, userName, password);
            console.log(secondaryAuthProviderloginFormSubmitResponse);

            let currentUserResponse = await restApi.getCurrentUser(cookieJar);
            if (currentUserResponse && restApi.SUCCESSFULL_STATUS_CODES.includes(currentUserResponse.status) && currentUserResponse.data instanceof Object) {
                window.showInformationMessage(`${chosenAuthProvider.text} Template library login has been successful!`);
                return;
            } else {
                window.showErrorMessage(`${chosenAuthProvider.text} Template library login attempt has failed! Please try again.`);
                saveNeeded = false;
                await deleteLoginInfo(context.workspaceState);
                await performAuthentication();
            }
        }
    }

    function shouldResume() {
        return new Promise<boolean>((resolve, reject) => {
        });
    }

    async function validateEmpty(value: string) {
        return value === '' ? 'Emtpy value is not allowed' : undefined;
    }

    const doCookieRequest = async (method: string, url: string, formData: object | undefined, cookieJar: CookieJar) => new Promise<IncomingMessage>((resolve, reject) => {
        console.log("Doing " + method + " request to " + url);
        req(url, {
            method: method,
            form: formData,
            headers: {
                "cookie": jarToHeader(url, cookieJar)
            },
            followRedirect: false,
            followAllRedirects: false,
        }, (error, response, body) => {
            if (error) {
                reject(error);
            } else {
                if (response.statusCode && response.statusCode >= 200 && response.statusCode <= 399) {
                    console.log("Response for " + method + " url " + url, response);
                    updateJar(url, cookieJar, response);
                    resolve(response);
                } else {
                    console.error(response);
                    reject(response);
                }
            }
        });
    });

    function updateJar(url: string, jar: CookieJar, response: IncomingMessage) {
        const setCookieHeaders = response.headers['set-cookie']!!;
        if (!setCookieHeaders) {
            console.log("Not updating jar, no set-cookie headers");
            return;
        }
        console.log("Updating cookies from set-cookie " + setCookieHeaders.toString());
        const newCookies = setCookieHeaders.map(c => Cookie.parse(c)!!);
        newCookies.forEach(c => {
            jar.setCookie(c, url);
        });
        console.log("Updated jar: ", jar);
    }

    function jarToHeader(url: string, jar: CookieJar) {
        const cookies = jar.getCookiesSync(url).map(c => {
            return c.cookieString();
        });
        console.log("Rendering cookies: ", cookies);
        return cookies;
    }

    async function doCookieRequestFollowRedirects(method: string, url: string, formData: object | undefined, cookieJar: CookieJar): Promise<IncomingMessage> {
        console.log("Follow redirects " + method + " request to " + url);
        const response = await doCookieRequest(method, url, formData, cookieJar);
        if (300 <= response.statusCode!! && response.statusCode!! <= 399) {
            let newMethod: string;
            if (response.statusCode!! === 302 || response.statusCode!! === 303) {
                console.log(response.statusCode!!.toString() + " received, switching from " + method + " to GET");
                newMethod = "GET";
            } else {
                console.log(response.statusCode!!.toString() + " received, continuing with " + method);
                newMethod = method;
            }

            console.log("Following redirect to " + response.headers["location"]!!);
            return await doCookieRequestFollowRedirects(newMethod, response.headers["location"]!!, formData, cookieJar);
        }
        return response;
    }

    function smartQuerySelectorAll(doc: Document, query: string) {
        const results: Element[] = [];
        doc.querySelectorAll(query).forEach(i => {
            results.push(i);
        });
        return results;
    }

    function getAuthProviders(doc: Document, pageUrlString: string) {
        console.log("getting auth providers");

        const authProviders: AuthProvider[] = [];
        const authProviderElements = smartQuerySelectorAll(doc, "#kc-social-providers ul a");
        authProviderElements.forEach(i => {
            authProviders.push({
                //@ts-ignore
                href: (new URL(i.href, pageUrlString)).href,
                text: i.firstElementChild?.textContent || "unknown provider"
            });
        });
        return authProviders;
    }

    async function doKeycloakLoginPage(cookieJar: CookieJar, page: Document, username: string, password: string) {
        //@ts-ignore
        const actionUrl = page.querySelector("#kc-form-login").attributes["action"].value;
        console.log("action url", actionUrl);

        return await doCookieRequestFollowRedirects(
            "POST",
            actionUrl,
            { "username": username, "password": password, "credentialId": "" },
            cookieJar
        );
    }

    async function loadLoginInfo(cookieJar: CookieJar, storage: vscode.Memento) {
        if (storage.get("tps-login-info")) {
            console.log("getting stored login info: " + storage.get("tps-login-info"));
            const cook = Cookie.parse(storage.get("tps-login-info") || "SHOULD NOT HAPPEN");
            await cookieJar.setCookie(cook!!, restApi.REST_API_ENDPOINT);
            await restApi.setCookieJar(cookieJar);
            console.log("Jar is now: ", cookieJar);
        } else {
            console.log("Login info is not stored.");
        }
    }

    async function saveLoginInfo(cookieJar: CookieJar, storage: vscode.Memento) {
        const cookString = (await cookieJar.getCookies(restApi.REST_API_ENDPOINT)).filter(i => i.key === "_forward_auth")[0].toString();
        console.log("Storing login info: " + cookString);
        await restApi.setCookieJar(cookieJar);
        await storage.update("tps-login-info", cookString);
    }

    vscode.window.showInformationMessage("Verifying auth...");
    cookieJar = new CookieJar();

    await loadLoginInfo(cookieJar, context.workspaceState);
    await performAuthentication();
    
    if (saveNeeded) {
        await saveLoginInfo(cookieJar, context.workspaceState);
        console.log("Default cookies for Template library are now: ", restApi.COOKIE_JAR);
    }

    window.showInformationMessage('Template library login action has finished.');
}

export async function deleteLoginInfo(storage: vscode.Memento) {
    console.log("Deleting login info...");
    await restApi.setCookieJar(null);
    await storage.update("tps-login-info", undefined);
}
