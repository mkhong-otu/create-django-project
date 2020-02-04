#! /usr/bin/env node
const exec = require('child_process').exec;
const meow = require('meow');
const path = require('path');
const fs = require('fs');
const packageName = require('./package').name;
const yaml = require('js-yaml');


const cli = meow(`
    Usage
      $ npx docker_bootstrap_django generate <projectName>
 
    Options
      --pythonVersion  Python Version
      --djangoVersion Django Version
 
    Examples
      $ npx ${packageName} generate proj
      $ npx ${packageName} generate proj .
      $ npx ${packageName} --pythonVersion 3.7 generate
      $ npx ${packageName} --djangoVersion 3.0.2 generate
`, {
  flags: {
    djangoVersion: {
      type: 'string',
      alias: 'd'
    },
    pythonVersion: {
      type: 'string',
      alias: 'p'
    },
  }
});

const projectName = cli.input[0];
if (!projectName) {
  cli.showHelp();
  process.exit();
}
let projectPath = process.cwd();
if (cli.input[1]) {
  if (path.isAbsolute(cli.input[1])) {
    projectPath = cli.input[1];
  } else {
    projectPath = path.join(process.cwd(), cli.input[1]);

  }
}
const pythonVersion = cli.flags.pythonVersion || '3.7';
const djangoVersion = cli.flags.djangoVersion;

const sourcePath = path.join(projectPath, 'src');
const requirementsFilename = 'requirements.txt';
const requirementsFilePath = path.join(sourcePath, requirementsFilename);

const run = () => {
  // check docker
  exec('docker -v', (err) => {
    if (err) {
      throw 'Require docker!';
    }
    return makeProjectDir();
  })
};

const makeProjectDir = () => {
  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true });
  }

  if (!fs.existsSync(sourcePath)) {
    fs.mkdirSync(sourcePath, { recursive: true });
  }

  // create requirements.txt
  if (!fs.existsSync(requirementsFilePath)) {
    fs.writeFileSync(requirementsFilePath, '', 'utf8');
  }
  makeDockerfile();
};

const makeDockerfile = () => {
  const dockerFileContext = [
    `FROM python:${pythonVersion}`,
    'WORKDIR /code',
    'ADD ./src /code',
    'RUN pip install --upgrade pip',
    'RUN pip install -r requirements.txt',
  ];


  const dockerFilePath = path.join(projectPath, 'Dockerfile');
  // create Dockerfile
  if (!fs.existsSync(dockerFilePath)) {
    fs.writeFileSync(dockerFilePath, dockerFileContext.join('\n'), 'utf8');
  }
  buildContainer();
};

const buildContainer = () => {
  const buildCmd = [
    `docker build -t "${projectName}" "${projectPath}"`,
  ];
  let djangoInstallCmd = '';
  if (fs.readFileSync(requirementsFilePath).toString().search('Django') < 0) {
    djangoInstallCmd = 'pip install django';
    if (djangoVersion) {
      djangoInstallCmd += `==${djangoVersion}`
    }
    // djangoInstallCmd += ' && ';
  }

  if (!fs.existsSync(path.join(sourcePath, 'manage.py'))) {
    djangoInstallCmd += djangoInstallCmd ? ` && ` : '';
    djangoInstallCmd += `django-admin startproject ${projectName} .`;
  }

  if (djangoInstallCmd) {
    djangoInstallCmd += ' && pip freeze > requirements.txt';
    djangoInstallCmd = `bash -c "${djangoInstallCmd}"`;
    buildCmd.push(`docker run --rm -v ${sourcePath}:/code ${projectName} ${djangoInstallCmd}`);

    const execute = exec(buildCmd.join(' && '), function(error){
      if (error) {
        console.error({error});
      }
      exec(`code ${projectPath}`);
    });
    execute.stdout.on('data', (data) => {
      console.log(data.toString());
    });
  }

  makeDockerComposeFile();
};

const makeDockerComposeFile = () => {
  const dockerComposeContext = {
    version: '3',
    services: {
      django: {
        build: '.',
        command: 'bash -c "python manage.py runserver 127.0.0.1:8000"',
        volumes: [ './src:/code' ],
        ports: [ '8000:8000' ]
      }
    }
  };
  const dockerComposePath = path.join(projectPath, 'docker-compose.yaml');
  if (!fs.existsSync(dockerComposePath)) {
    const dockerComposeYaml = yaml.dump(dockerComposeContext);
    fs.writeFileSync(dockerComposePath, dockerComposeYaml, 'utf8')
  }

};



run();
