import * as vscode from 'vscode';
import axios, { AxiosResponse } from 'axios';
import * as FormData from 'form-data';
import * as fs from 'fs';

import DateTimeFormat = Intl.DateTimeFormat;

export let REST_API_ENDPOINT = "https://template-library-radon.xlab.si/api";

interface RequestHeaders {
    [key: string]: any
}

export let JWT_BEARER_TOKEN: string;
export const SUCCESSFULL_STATUS_CODES = [200, 201, 202];

export async function configureApiEndpoint(restApiEndpoint: string) {
    REST_API_ENDPOINT = restApiEndpoint;
}

export async function addInterceptors() {
    await axios.interceptors.request.use(request => {
        console.log('Starting Request', request);
        return request;
    });

    await axios.interceptors.response.use(response => {
        console.log('Response:', response);
        return response;
    });
}

export async function getCurrentUser(): Promise<AxiosResponse<any> | null> {
    await addInterceptors();
    let httpResponse: AxiosResponse<any> | null = null;

    await axios.get(REST_API_ENDPOINT + '/users/current', { timeout: 5000 })
        .then(function (response) {
            console.log(response);
            httpResponse = response;
        })
        .catch(function (error) {
            if (error.code === 'ECONNABORTED') {
                httpResponse = null;
            } else {
                console.log(error);
                httpResponse = error;
                vscode.window.showInformationMessage(error);
            }
        });

    return httpResponse;
}

export async function postLogin(username: string, password: string): Promise<AxiosResponse<any> | null> {
    let httpResponse: AxiosResponse<any> | null = null;

    const user = JSON.stringify({
        "username": username,
        "password": password
    });

    let requestHeaders: RequestHeaders = { 'Content-Type': 'application/json' };

    await axios.post(REST_API_ENDPOINT + '/auth/login', user, { headers: requestHeaders })
        .then(function (response) {
            console.log(response);
            JWT_BEARER_TOKEN = response.data.token;
            httpResponse = response;
        }).catch(function (error) {
            console.log(error);
            if (error.response) {
                httpResponse = error.response;
            } else if (error.request) {
                httpResponse = error.request;
            } else {
                httpResponse = error;
            }
        });

    return httpResponse;
}

export async function getTemplates(): Promise<AxiosResponse<any> | null> {
    let httpResponse: AxiosResponse<any> | null = null;

    let requestHeaders: RequestHeaders = {};
    if (JWT_BEARER_TOKEN) {
        requestHeaders['Authorization'] = `Bearer ${JWT_BEARER_TOKEN}`;
    }

    await axios.get(REST_API_ENDPOINT + '/templates', { headers: requestHeaders })
        .then(function (response) {
            console.log(response);
            httpResponse = response;
        })
        .catch(function (error) {
            console.log(error);
            if (error.response) {
                httpResponse = error.response;
            } else if (error.request) {
                httpResponse = error.request;
            } else {
                httpResponse = error;
            }
        });

    return httpResponse;
}

export async function getTemplateTypes(): Promise<AxiosResponse<any> | null> {
    let httpResponse: AxiosResponse<any> | null = null;

    let requestHeaders: RequestHeaders = {};
    if (JWT_BEARER_TOKEN) {
        requestHeaders['Authorization'] = `Bearer ${JWT_BEARER_TOKEN}`;
    }

    await axios.get(REST_API_ENDPOINT + '/template_types', { headers: requestHeaders })
        .then(function (response) {
            console.log(response);
            httpResponse = response;
        })
        .catch(function (error) {
            console.log(error);
            if (error.response) {
                httpResponse = error.response;
            } else if (error.request) {
                httpResponse = error.request;
            } else {
                httpResponse = error;
            }
        });

    return httpResponse;
}

export async function getTemplateVersions(templateName: string): Promise<AxiosResponse<any> | null> {
    let httpResponse: AxiosResponse<any> | null = null;

    let requestHeaders: RequestHeaders = {};
    if (JWT_BEARER_TOKEN) {
        requestHeaders['Authorization'] = `Bearer ${JWT_BEARER_TOKEN}`;
    }

    await axios.get(REST_API_ENDPOINT + `/templates/${templateName}/versions`, { headers: requestHeaders })
        .then(function (response) {
            console.log(response);
            httpResponse = response;
        })
        .catch(function (error) {
            console.log(error);
            if (error.response) {
                httpResponse = error.response;
            } else if (error.request) {
                httpResponse = error.request;
            } else {
                httpResponse = error;
            }
        });

    return httpResponse;
}

export async function getTemplateVersionFiles(templateName: string, versionName: string, destination: string): Promise<AxiosResponse<any> | null> {
    let httpResponse: AxiosResponse<any> | null = null;

    let requestHeaders: RequestHeaders = {};
    if (JWT_BEARER_TOKEN) {
        requestHeaders['Authorization'] = `Bearer ${JWT_BEARER_TOKEN}`;
    }

    await axios.get(REST_API_ENDPOINT + `/templates/${templateName}/versions/${versionName}/files`, { headers: requestHeaders, responseType: 'arraybuffer', timeout: 10000, })
        .then(function (response) {
            console.log(response);
            httpResponse = response;

            fs.writeFile(destination, response.data, (err) => {
                if (err) {
                    throw err;
                }
                console.log('The file has been saved!');
            });
        })
        .catch(function (error) {
            console.log(error);
            if (error.response) {
                httpResponse = error.response;
            } else if (error.request) {
                httpResponse = error.request;
            } else {
                httpResponse = error;
            }
        });

    return httpResponse;
}

export async function postTemplate(name: string, description: string, templateTypeName: string, publicAccess: boolean): Promise<AxiosResponse<any> | null> {
    let httpResponse: AxiosResponse<any> | null = null;

    const template = JSON.stringify({
        "name": name,
        "description": description,
        "template_type_name": templateTypeName,
        "public_access": publicAccess
    });

    let requestHeaders: RequestHeaders = { 'Content-Type': 'application/json' };
    if (JWT_BEARER_TOKEN) {
        requestHeaders['Authorization'] = `Bearer ${JWT_BEARER_TOKEN}`;
    }

    await axios.post(REST_API_ENDPOINT + '/templates', template, { headers: requestHeaders })
        .then(function (response) {
            console.log(response);
            httpResponse = response;
        }).catch(function (error) {
            console.log(error);
            if (error.response) {
                httpResponse = error.response;
            } else if (error.request) {
                httpResponse = error.request;
            } else {
                httpResponse = error;
            }
        });

    return httpResponse;
}

export async function postVersion(templateName: string, versionName: string, templateFile: string, readmeFile?: string, implementationFiles?: string[]): Promise<AxiosResponse<any> | null> {
    let httpResponse: AxiosResponse<any> | null = null;
    const form = new FormData();

    form.append('version_name', versionName);

    if (readmeFile) {
        form.append('readme_file', fs.createReadStream(readmeFile));
    }

    form.append('template_file', fs.createReadStream(templateFile));

    if (implementationFiles) {
        console.log(implementationFiles);
        for (let file of implementationFiles) {
            console.log(file);
            form.append('implementation_file', fs.createReadStream(file));
        }
    }

    let requestHeaders: RequestHeaders = form.getHeaders();
    if (JWT_BEARER_TOKEN) {
        requestHeaders['Authorization'] = `Bearer ${JWT_BEARER_TOKEN}`;
    }

    await axios.post(REST_API_ENDPOINT + `/templates/${templateName}/versions`, form, { headers: requestHeaders })
        .then(function (response) {
            console.log(response);
            httpResponse = response;
        }).catch(function (error) {
            console.log(error);
            if (error.response) {
                httpResponse = error.response;
            } else if (error.request) {
                httpResponse = error.request;
            } else {
                httpResponse = error;
            }
        });

    return httpResponse;
}

export class Template {
    constructor(id: number, name: string, description: string, templateTypeId: number, publicAccess: boolean, createdBy: number, createdAt: DateTimeFormat) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.templateTypeId = templateTypeId;
        this.publicAccess = publicAccess;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
    }

    id: number;
    name: string;
    description: string;
    templateTypeId: number;
    publicAccess: boolean;
    createdBy: number;
    createdAt: DateTimeFormat;
}
