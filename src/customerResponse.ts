export function customerResponseDraft(teamName: string, route: string): string {
  const greeting = `Hi ${teamName} team,`;

  if (route === "emerging") {
    return `${greeting} It looks like Convex is becoming an important part of your workflow. If it would be helpful, we can share practical guidance for scaling your setup and connect you with the right person.`;
  }

  if (route === "pressure") {
    return `${greeting} It looks like your team is getting a lot of value from Convex. We’d be happy to help you evaluate the right plan for your usage and talk through your setup. Would a short conversation be useful?`;
  }

  if (route === "both") {
    return `${greeting} Thanks for reaching out about your enterprise needs. As your usage grows, we can help with the technical details and the right next steps for your team. What would be most helpful to cover first?`;
  }

  return `${greeting} Thanks for reaching out about your enterprise needs. We can help with the technical details and next steps for your team. What would be most helpful to cover first?`;
}
