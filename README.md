# Template library plugin for RADON IDE
This repository allows you to set up RADON IDE Template library plugin. To prevent any possible confusions 
remember that Template library (service) or its parts may also be called TPS (Template Publishing Service) or 
TLPS (Template Library Publishing Service).

## Table of Contents
  - [Installation and publishing](#installation-and-publishing)
  - [Main features](#main-features)

## Installation and publishing
This is originally a Visual Studio Code extension/plugin, so the best way to test it locally is to through VS 
Code's extension development host. 

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
