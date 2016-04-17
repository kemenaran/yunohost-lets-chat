## This package is deprecated

**This package is deprecated**: it uses old sources, and will probably not work on your machine. This is because:

* Let's Chat requires to install npm modules, including many binary modules. Providing a stable way to install npm dependencies is hard.
* Let's Chat development is less active than other groupchat projects.
* I switched to Mattermost, which I like better and is much easier to install.

If you are interested in a self-hosted chat system, try this [Mattermost package](https://github.com/kemenaran/mattermost_ynh) instead. 

## Description

A Yunohost package for [Let's Chat](https://sdelements.github.io/lets-chat/), a self-hosted chat for small teams.

## Installation

You can either :

* Install from the Admin web interface, by providing this URL: `https://github.com/kemenaran/yunohost-lets-chat`
* Install from the command-line: `yunohost app install https://github.com/kemenaran/yunohost-lets-chat`

## What works

* Installation on domain's root
* Upgrade and removal
* LDAP integration

## TODO

* Allow installation in sub-directory (only root-domains work for now)
