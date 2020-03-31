const path = require('path');
const cdk = require('@aws-cdk/core');
const elasticbeanstalk = require('@aws-cdk/aws-elasticbeanstalk');
const iam = require('@aws-cdk/aws-iam');

const constants = require('./constants');

class ElasticBeanStalkStack extends cdk.Stack {

  constructor(scope, id, props) {
    super(scope, id, props);

    const node = this.node;

    const appName = node.tryGetContext('appName');
    const solutionStackName = node.tryGetContext('solutionStackName');

    const ebEc2Role = new iam.Role(this,
      constants.ELASTICBEANSTALK_EC2_ROLE_NAME, {
      roleName: constants.ELASTICBEANSTALK_EC2_ROLE_NAME,
      managedPolicies: [
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AWSElasticBeanstalkMulticontainerDocker' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier' },
      ],
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });

    const ebEc2InstanceProfile = new iam.CfnInstanceProfile(this,
      constants.ELASTICBEANSTALK_INSTANCE_PROFILE_NAME, {
      instanceProfileName: constants.ELASTICBEANSTALK_INSTANCE_PROFILE_NAME,
      roles: [ebEc2Role.roleName]
    });

    const ebServiceRole = new iam.Role(this,
      constants.ELASTICBEANSTALK_SERVICE_ROLE_NAME, {
      roleName: constants.ELASTICBEANSTALK_SERVICE_ROLE_NAME,
      managedPolicies: [
        { managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkService' },
      ],
      assumedBy: new iam.ServicePrincipal('elasticbeanstalk.amazonaws.com')
    });

    const app = new elasticbeanstalk.CfnApplication(this, 'Application', {
      applicationName: appName
    });

    const applicationVersion = new elasticbeanstalk.CfnApplicationVersion(this,
      'ApplicationVersion', {
      applicationName: app.applicationName,
      sourceBundle: {
        s3Bucket: props.bucket.bucketName,
        s3Key: constants.ELASTICBEANSTALK_S3_APPVERSION_KEY,
      },
    });

    const configurationTemplate = new elasticbeanstalk.CfnConfigurationTemplate(this,
      'ConfigurationTemplate', {
      applicationName: app.applicationName,
      solutionStackName,
      optionSettings: [
        {
          namespace: 'aws:autoscaling:asg',
          optionName: 'MinSize',
          value: '1'
        },
        {
          namespace: 'aws:autoscaling:asg',
          optionName: 'MaxSize',
          value: '2',
        },
        {
          namespace: 'aws:elasticbeanstalk:environment',
          optionName: 'EnvironmentType',
          value: 'LoadBalanced',
        },
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'IamInstanceProfile',
          value: ebEc2InstanceProfile.instanceProfileName,
        },
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'EC2KeyName',
          value: constants.ELASTICBEANSTALK_EC2_KEYPAIR_NAME,
        }
      ]
    });

    const environment = new elasticbeanstalk.CfnEnvironment(this, 'Environment', {
      applicationName: app.applicationName || appName,
      templateName: configurationTemplate.ref,
      versionLabel: applicationVersion.ref,
    });

    this.stackUrl = environment.attrEndpointUrl;

    app.addDependsOn(ebEc2Role);
    app.addDependsOn(ebServiceRole);
    configurationTemplate.addDependsOn(app);
    environment.addDependsOn(app);
    applicationVersion.addDependsOn(app);
  }
}

module.exports = ElasticBeanStalkStack;
