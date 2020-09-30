# Template library plugin for RADON IDE
This repository allows you to set up RADON IDE Template library plugin. To prevent any possible confusions 
remember that Template library (service) or its parts may also be called TPS (Template Publishing Service) or 
TLPS (Template Library Publishing Service). If you are totally unfamiliar with TPS you can take a look at the
[Template library's documentation](https://template-library-radon.xlab.si/docs).

## Table of Contents
  - [Installation and publishing](#installation-and-publishing)
  - [Main features](#main-features)
  - [Usage](#usage)
    - [Template library set REST API endpoint](#template-library-set-rest-api-endpoint)
    - [Template library config actions](#template-library-config-actions)
      - [Create template JSON config](#create-template-json-config)
      - [Upload template version JSON config](#upload-template-version-json-config)
      - [Download template version JSON config](#download-template-version-json-config)
    - [Template library interactive actions](#template-library-interactive-actions)

## Installation and publishing
This is originally a Visual Studio Code extension/plugin, so the best way to test it locally is to through VS 
Code's extension development host. RADON IDE is represented by Eclipse Che which uses an open-source cloud and 
desktop IDE framework called Eclipse Theia within the workspaces. Eclipse Theia is very similar to VS Code and
therefore VS Code extensions can be also used in Theia.

Here's what you need to do to test the plugin and to package/publish it:

```bash
# install Node JS from https://nodejs.org/en/download/
# and test it with node -v and npm -v command

# install prerequisite packages
npm install

# test the plugin in VS Code (this will open a new window with your extension loaded)
press F5 (Run Extension)

# package and publish the extension
# if you don't have npx install it with: npm install npx
npx vsce package
```

## Main features
The extension uses Template library REST API and can therefore invoke various Template library actions. 

Currently, supported actions are:

- [x] setting Template library REST API endpoint
- [x] creating and publishing TOSCA template or CSAR and its version
- [x] downloading a specific template version files

## Usage
The plugin is invoked by right clicking on the file from file explorer or in the editor. There are three 
commands that can be selected from the dropdown options and these are further explained within the next sections. 

### Template library set REST API endpoint
This command is used to set TPS REST API endpoint that will be used for executing the TPS HTTP requests. The 
default value here is `https://template-library-radon.xlab.si/api` which is pointing to the public TPS REST API URL.
This command was meant mostly for testing different versions of TPS API so currently there is no need to change it.

### Template library config actions
If you choose this option the TPS actions can be invoked via JSON config file. If you right clicked on the JSON
file (from the editor or from the file explorer) you will be offered to chose it as a config file. If not, you will
be asked to select this configuration file from other folders.

JSON object that is present in the config file should follow an exact structure with which depends on the type of the action.
The JSON keys specified are not mutally exclusive so you can execute muliple TPS actions with one JSON config file.

#### Create template JSON config
JSON object for creating a template must have all these keys:

|    JSON key      |   Description    |
|:-----------------|:-----------------|
| **upload_template_name** | Template name you want to create |
| **upload_template_description** | Template description |
| **upload_template_type_name** | Template type name (one of: data, artifact, capability, requirement, relationship, interface, node, group, policy, csar,other) |
| **upload_public_access** | Make template publicly visible for other TPS users (true/false) |

Example:

```json
{
    "upload_template_name": "aws_bucket",
    "upload_template_description": "AWS bucket node",
    "upload_template_type_name": "node",
    "upload_public_access": "true"
}
```

#### Upload template version JSON config
When uploading a template version you can use the following keys (`upload_readme_file` and `upload_implementation_files` are optional).

|    JSON key      |   Description    |
|:-----------------|:-----------------|
| **upload_version_name** | Semantic version name |
| **upload_readme_file** | Optional path to README file to upload |
| **upload_template_file** | TOSCA YAML service template file or compressed TOSCA Cloud Service Archive (CSAR) |
| **upload_implementation_files** | Optional JSON array of paths to TOSCA model implementation files (Ansible playbooks) |

Example:

```json
{
    "upload_version_name": "2.1.5",
    "upload_readme_file": "./aws_bucket/README.md",
    "upload_template_file": "./aws_bucket/service_template.yaml",
    "upload_implementation_files": [
        "./aws_bucket/playbooks/create.yaml",
        "./aws_bucket/playbooks/delete.yaml"
    ]
}
```

#### Download template version JSON config
When downloading template version files you will get all version files (TOSCA template and playbooks) compressed in a zip 
file (if you provided just a CSAR without implmentation files, you will get back this CSAR).

|    JSON key      |   Description    |
|:-----------------|:-----------------|
| **download_template_name** | Name of the template you want to download |
| **download_version_name** | Semantic template version you want to get files from |
| **download_path** | Path where downloaded file will be stored |

Example:

```json
{
    "download_template_name": "aws_bucket",
    "download_version_name": "2.1.5",
    "download_path": "./AwsBucket.zip"
}
```

### Template library interactive actions
This TPS RADON IDE extension command will guide you through an interactive Eclipse Theia tasks, where you will be able
to create templates, upload template versions or download version files from Template library service.