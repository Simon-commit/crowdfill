# Security

Found a security problem? Please e-mail **dev@dyrt.io** instead of opening a public issue. Include the Crowdfill version and the steps to reproduce it, and I'll get back to you as soon as I can.

A few things Crowdfill does on purpose:

- The background only accepts messages from Crowdfill's own pages, never from websites or content scripts.
- Nothing is sent to servers run by us. There aren't any.
- The optional Claude API key is kept in local extension storage and only sent to api.anthropic.com.
