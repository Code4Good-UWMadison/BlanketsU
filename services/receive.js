"use strict";

const Response = require("./response"),
  // Curation = require("./curation"),
  // Order = require("./order"),
  // Care = require("./care"),
  // Survey = require("./survey"),
  GraphAPi = require("./graph-api"),
  i18n = require("../i18n.config"),
  mongodb = require("mongodb"),
  config = require("./config"),
  locales = i18n.getLocales();
// config = require("./config");

let uri =
  "mongodb://heroku_pxzvn9n3:gub4hnsnbdantjd9c2rkq8foj2@ds163517.mlab.com:63517/heroku_pxzvn9n3";

module.exports = class Receive {
  constructor(user, webhookEvent) {
    this.user = user;
    this.webhookEvent = webhookEvent;
  }

  // Check if the event is a message or postback and
  // call the appropriate handler function
  handleMessage() {
    let event = this.webhookEvent;

    let responses;

    try {
      if (event.message) {
        let message = event.message;

        if (message.quick_reply) {
          responses = this.handleQuickReply();
        } else if (message.attachments) {
          responses = this.handleAttachmentMessage();
        } else if (message.text) {
          responses = this.handleTextMessage();
        }
      } else if (event.postback) {
        responses = this.handlePostback();
      } else if (event.referral) {
        responses = this.handleReferral();
      }
    } catch (error) {
      console.error(error);
      responses = {
        text: `An error has occured: '${error}'. We have been notified and \
        will fix the issue shortly!`
      };
    }

    if (Array.isArray(responses)) {
      let delay = 0;
      for (let response of responses) {
        this.sendMessage(response, delay * 2000);
        delay++;
      }
    } else {
      this.sendMessage(responses);
    }
  }

  // Handles messages events with text
  handleTextMessage() {
    console.log(
      "Received text:",
      `${this.webhookEvent.message.text} for ${this.user.psid}`
    );

    // check greeting is here and is confident
    let greeting = this.firstEntity(this.webhookEvent.message.nlp, "greetings");

    let message = this.webhookEvent.message.text.trim().toLowerCase();

    let response;

    if (
      (greeting && greeting.confidence > 0.8) ||
      message.includes("start over")
    ) {
      response = Response.genNuxMessage(this.user);
    } else {
      console.log("???", `${this.user.firstName}`);
      response = [
        Response.genText(
          i18n.__("fallback.any", {
            message: this.webhookEvent.message.text
          })
        ),
        Response.genText(
          i18n.__("get_started.welcome", {
            user_first_name: this.user.firstName
          })
        ),
        Response.genText(i18n.__("get_started.guidance")),
        Response.genQuickReply(i18n.__("get_started.help"), [
          // {
          //   title: i18n.__("menu.suggestion"),
          //   payload: "CURATION"
          // },
          {
            title: i18n.__("menu.donor"),
            payload: "DONOR"
          },
          {
            title: i18n.__("menu.donee"),
            payload: "DONEE"
          },
          {
            title: i18n.__("menu.help"),
            payload: "CARE_HELP"
          }
        ])
      ];
    }

    return response;
  }

  // Handles mesage events with attachments
  handleAttachmentMessage() {
    let response;

    // Get the attachment
    let attachment = this.webhookEvent.message.attachments[0];
    console.log("Received attachment:", `${attachment} for ${this.user.psid}`);

    response = Response.genQuickReply(i18n.__("fallback.attachment"), [
      {
        title: i18n.__("menu.help"),
        payload: "CARE_HELP"
      },
      {
        title: i18n.__("menu.start_over"),
        payload: "GET_STARTED"
      }
    ]);

    return response;
  }

  // Handles mesage events with quick replies
  handleQuickReply() {
    // Get the payload of the quick reply
    let payload = this.webhookEvent.message.quick_reply.payload;

    return this.handlePayload(payload);
  }

  // Handles postbacks events
  handlePostback() {
    let postback = this.webhookEvent.postback;
    // Check for the special Get Starded with referral
    let payload;
    if (postback.referral && postback.referral.type == "OPEN_THREAD") {
      payload = postback.referral.ref;
    } else {
      // Get the payload of the postback
      payload = postback.payload;
    }
    return this.handlePayload(payload.toUpperCase());
  }

  // Handles referral events
  handleReferral() {
    // Get the payload of the postback
    let payload = this.webhookEvent.referral.ref.toUpperCase();

    return this.handlePayload(payload);
  }

  handleDonorPayload() {
    let response;
    response = [
      Response.genText(
        i18n.__("donor.prompt", {
          user_first_name: "{{user_first_name}}"
        })
      ),
      Response.genQuickReply(i18n.__("donor.question"), [
        {
          title: i18n.__("donor.one"),
          payload: "DONATE_ONE"
        },
        {
          title: i18n.__("donor.two"),
          payload: "DONATE_TWO"
        },
        {
          title: i18n.__("donor.other"),
          payload: "DONATE_MORE"
        }
      ])
    ];
    return response;
  }

  handleDoneePayload() {
    let response;
    response = [
      Response.genText(
        i18n.__("donee.prompt", {
          user_first_name: "{{user_first_name}}"
        })
      ),
      Response.genQuickReply(i18n.__("donee.question"), [
        {
          title: i18n.__("donee.one"),
          payload: "NEED_ONE"
        },
        {
          title: i18n.__("donee.two"),
          payload: "NEED_TWO"
        },
        {
          title: i18n.__("donee.other"),
          payload: "NEED_MORE"
        }
      ])
    ];

    return response;
  }

  handlePayload(payload) {
    console.log("Received Payload:", `${payload} for ${this.user.psid}`);

    // Log CTA event in FBA
    GraphAPi.callFBAEventsAPI(this.user.psid, payload);

    let response;

    // Set the response based on the payload
    if (
      payload === "GET_STARTED" ||
      payload === "DEVDOCS" ||
      payload === "GITHUB"
    ) {
      response = Response.genNuxMessage(this.user);
    } else if (payload.includes("DONOR")) {
      response = this.handleDonorPayload();
    } else if (payload.includes("DONEE")) {
      response = this.handleDoneePayload();
      // } else if (payload.includes("DONATE_ONE")) {
      //   this.recordDonor("one");
      // } else if (payload.includes("DONATE_TWO")) {
      //   this.recordDonor("two");
      // } else if (payload.includes("DONATE_MORE")) {
      //   this.recordDonor("more");
      // } else if (payload.includes("NEED_ONE")) {
      //   this.recordDonee("one");
      // } else if (payload.includes("NEED_TWO")) {
      //   this.recordDonee("two");
      // } else if (payload.includes("NEED_MORE")) {
      //   this.recordDonee("more");
    } else {
      response = {
        text: `This is a default postback message for payload: ${payload}!`
      };
    }

    return response;
  }

  recordDonor(number) {
    mongodb.MongoClient.connect(uri, function(err, client) {
      if (err) throw err;
      let db = client.db("dbname");
      let donors = db.collection("donors");
    });
  }

  recordDonee(number) {
    mongodb.MongoClient.connect(uri, function(err, client) {
      if (err) throw err;
      let db = client.db("dbname");
      let donees = db.collection("donees");
    });
  }

  sendMessage(response, delay = 0) {
    // Check if there is delay in the response
    if ("delay" in response) {
      delay = response["delay"];
      delete response["delay"];
    }

    // Construct the message body
    let requestBody = {
      recipient: {
        id: this.user.psid
      },
      message: response
    };

    // Check if there is persona id in the response
    if ("persona_id" in response) {
      let persona_id = response["persona_id"];
      delete response["persona_id"];

      requestBody = {
        recipient: {
          id: this.user.psid
        },
        message: response,
        persona_id: persona_id
      };
    }

    setTimeout(() => GraphAPi.callSendAPI(requestBody), delay);
  }

  firstEntity(nlp, name) {
    return nlp && nlp.entities && nlp.entities[name] && nlp.entities[name][0];
  }
};
