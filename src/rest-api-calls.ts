import { AxiosResponse } from 'axios';
import * as FormData from 'form-data';
import * as fs from 'fs';
import { CookieJar } from 'jsdom';

const axios = require('axios').default;
const axiosCookieJarSupport = require('axios-cookiejar-support').default;

axiosCookieJarSupport(axios);

export let REST_API_ENDPOINT = 'https://template-library-xopera.xlab.si/api';

interface RequestHeaders {
    [key: string]: any
}

export let COOKIE_JAR: CookieJar | null = null;
export const SUCCESSFULL_STATUS_CODES = [200, 201, 202];

export async function configureApiEndpoint(restApiEndpoint: string) {
    REST_API_ENDPOINT = restApiEndpoint;
}

export async function setCookieJar(cookieJar: CookieJar | null) {
    COOKIE_JAR = cookieJar;
}

export async function addInterceptors() {
    await axios.interceptors.request.use((request: any) => {
        console.log('Starting Request', request);
        return request;
    });

    await axios.interceptors.response.use((response: any) => {
        console.log('Response:', response);
        return response;
    });
}

export async function getCurrentUser(cookieJar: CookieJar | null = null): Promise<AxiosResponse<any> | null> {
    await addInterceptors();
    let httpResponse: AxiosResponse<any> | null = null;
    let requestHeaders: RequestHeaders = {};

    await axios.get(REST_API_ENDPOINT + '/users/current', { headers: requestHeaders, timeout: 7000, jar: cookieJar, withCredentials: true })
        .then(function (response: AxiosResponse<any> | null) {
            console.log(response);
            httpResponse = response;
        })
        .catch(function (error: any) {
            if (error.code === 'ECONNABORTED') {
                httpResponse = null;
            } else if (error.code === 'ENOTFOUND') {
                httpResponse = null;
            } else {
                console.log(error);
                httpResponse = error;
            }
        });

    return httpResponse;
}

export async function getTemplates(): Promise<AxiosResponse<any> | null> {
    let httpResponse: AxiosResponse<any> | null = null;
    let requestHeaders: RequestHeaders = {};

    await axios.get(REST_API_ENDPOINT + '/templates', { headers: requestHeaders, jar: COOKIE_JAR, withCredentials: true })
        .then(function (response: AxiosResponse<any>) {
            console.log(response);
            httpResponse = response;
        })
        .catch(function (error: any) {
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

    await axios.get(REST_API_ENDPOINT + '/templateTypes', { headers: requestHeaders, jar: COOKIE_JAR, withCredentials: true })
        .then(function (response: AxiosResponse<any>) {
            console.log(response);
            httpResponse = response;
        })
        .catch(function (error: any) {
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

    await axios.get(REST_API_ENDPOINT + `/templates/${templateName}/versions`, { headers: requestHeaders, jar: COOKIE_JAR, withCredentials: true })
        .then(function (response: AxiosResponse<any>) {
            console.log(response);
            httpResponse = response;
        })
        .catch(function (error: any) {
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

    await axios.get(REST_API_ENDPOINT + `/templates/${templateName}/versions/${versionName}/templateFile`, { headers: requestHeaders, responseType: 'arraybuffer', timeout: 10000, jar: COOKIE_JAR, withCredentials: true })
        .then(function (response: AxiosResponse<any>) {
            console.log(response);
            httpResponse = response;

            fs.writeFile(destination, response.data, (err) => {
                if (err) {
                    throw err;
                }
                console.log('The file has been saved!');
            });
        })
        .catch(function (error: any) {
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
    let requestHeaders: RequestHeaders = { 'Content-Type': 'application/json' };

    const template = JSON.stringify({
        "name": name,
        "description": description,
        "templateTypeName": templateTypeName,
        "publicAccess": publicAccess
    });

    await axios.post(REST_API_ENDPOINT + '/templates', template, { headers: requestHeaders, jar: COOKIE_JAR, withCredentials: true })
        .then(function (response: AxiosResponse<any>) {
            console.log(response);
            httpResponse = response;
        }).catch(function (error: any) {
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

export async function postVersion(templateName: string, versionName: string, templateFile: string, readmeFile?: string): Promise<AxiosResponse<any> | null> {
    let httpResponse: AxiosResponse<any> | null = null;
    const form = new FormData();

    form.append('versionName', versionName);

    if (readmeFile) {
        form.append('readmeFile', fs.createReadStream(readmeFile));
    }

    form.append('templateFile', fs.createReadStream(templateFile));

    let requestHeaders: RequestHeaders = form.getHeaders();

    await axios.post(REST_API_ENDPOINT + `/templates/${templateName}/versions`, form, { headers: requestHeaders, jar: COOKIE_JAR, withCredentials: true })
        .then(function (response: AxiosResponse<any>) {
            console.log(response);
            httpResponse = response;
        }).catch(function (error: any) {
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
