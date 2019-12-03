'use strict';

const platformClient = require('purecloud-platform-client-v2');
const responseLib = require('./libs/response-lib');

const client = platformClient.ApiClient.instance;
const clientId = 'a49ab989-0802-40a6-8c95-da1b6a44ecf0';
const clientSecret = '4p5mgg6ooH80DNqRj2Xro51VtO87YyhgBe323TaVIVk';
const environment = 'mypurecloud.ie';

module.exports.dialAttempts = async event => {

  //#region Validation

  let body;

  console.log('Event:', event);
  if (event.hasOwnProperty('body')) {
    body = JSON.parse(event.body);
  } else {
    body = event;
  }
  console.log('Body:', body);

  //#endregion

  let count1 = 0, count2 = 0, count3 = 0;

  try {
    const { contactListName, number1, number2, number3 } = body;
    console.log('Getting dialing attempts for list: ' + contactListName + " and number1 " + number1);

    // Authenticate
    await authenticate(clientId, clientSecret, environment);

    // Get Contact List
    let contactListId = await getContactListId(contactListName);

    // Get Dial Attempts
    if (number1) count1 = await getDialAttempts(contactListId, number1);
    if (number2) count2 = await getDialAttempts(contactListId, number2);
    if (number3) count3 = await getDialAttempts(contactListId, number3);

    let data = {
      attempts1: count1,
      attempts2: count2,
      attempts3: count3
    };

    console.log('Returning:', data);
    return data;
  } catch (error) {
    console.error(error.message);
    return responseLib.failure({ message: error.message });
  }
};

function authenticate(clientId, clientSecret, environment) {
  return new Promise((resolve, reject) => {
    client.setEnvironment(environment);
    client.loginClientCredentialsGrant(clientId, clientSecret)
      .then(() => {
        resolve();
      })
      .catch((err) => {
        reject(err);
      });
  })
}

function getContactListId(contactListName) {
  console.log('Getting contact list id for:', contactListName);

  return new Promise((resolve, reject) => {
    let apiInstance = new platformClient.OutboundApi();

    let opts = {
      pageSize: 1,
      pageNumber: 1,
      name: contactListName
    };

    apiInstance.getOutboundContactlists(opts)
      .then((data) => {
        if (data.entities.length > 0) {
          resolve(data.entities[0].id);
        } else {
          reject();
        }
      })
      .catch((err) => {
        console.log('There was a failure calling getOutboundContactlists');
        reject(err);
      });
  });
}

function getDialAttempts(contactListId, phoneNumber) {
  console.log('Getting dial attempts for phone:', phoneNumber, 'and contact list id:', contactListId);
  return new Promise((resolve, reject) => {
    var startDate = new Date().toISOString().slice(0, 10) + 'T' + '00:00:00.000Z';
    var endDate = new Date().toISOString().slice(0, 10) + 'T' + '23:59:59.999Z';

    let apiInstance = new platformClient.AnalyticsApi();

    let body = {
      "interval": `${startDate}/${endDate}`,
      "order": "asc",
      "orderBy": "conversationStart",
      "paging": {
        "pageSize": 100,
        "pageNumber": 1
      },
      "segmentFilters": [
        {
          "type": "and",
          "predicates": [
            {
              "type": "dimension",
              "dimension": "dnis",
              "operaor": "matches",
              "value": "tel:+" + phoneNumber
            },
            {
              "type": "dimension",
              "dimension": "outboundContactListId",
              "operator": "matches",
              "value": contactListId
            }
          ]
        }
      ]
    };

    apiInstance.postAnalyticsConversationsDetailsQuery(body)
      .then(async (data) => {
        var count = 0;
        //console.log(JSON.stringify(conversations, null, 2));
        if (data.conversations != null) {
          console.log('found ' + data.conversations.length + ' conversations');
          for (var i = 0; i < data.conversations.length; i++) {
            //console.log('found ' + data.conversations[i].participants.length + ' participants');
            for (var k = 0; k < data.conversations[i].participants.length; k++) {
              if (data.conversations[i].participants[k] != null && data.conversations[i].participants[k].purpose == 'agent') {
                //console.log('found customer');
                if (data.conversations[i].participants[k].sessions) {
                  //console.log('found ' + data.conversations[i].participants[k].sessions.length + ' sessions');
                  for (var j = 0; j < data.conversations[i].participants[k].sessions.length; j++) {
                    //console.log('mediaType: ' + data.conversations[i].participants[k].sessions[j].mediaType);
                    if (data.conversations[i].participants[k].sessions[j] != null && data.conversations[i].participants[k].sessions[j].mediaType == 'voice') {
                      //console.log('found voice session');
                      if (data.conversations[i].participants[k].sessions[j].dnis == ('tel:+' + phoneNumber)) {
                        count++;
                        console.log('found an ' + data.conversations[i].participants[k].sessions[j].direction + ' attempt for dnis: ' + phoneNumber);
                        //console.log(JSON.stringify(data.conversations[i].participants[k].sessions[j], null, 2));
                      }
                    }
                  }
                }
              }
            }
          }
        } else {
          console.log("### ERROR ### - no conversations found");
        }
        resolve(count);
      })
      .catch((err) => {
        console.log('There was a failure getting conversations analytics');
        reject(err);
      });
  });
}