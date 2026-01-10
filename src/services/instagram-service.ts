import axios from "axios";

function getRedirectUri() {
  return (
    process.env.INSTAGRAM_REDIRECT_URI || `${process.env.API_URL || "http://localhost:9005"}/instagram/oauth2callback`
  );
}

function getClient() {
  // prefer the `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` names from the .env
  // but fall back to older `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` if present
  const clientId = process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_CLIENT_ID || "";
  const clientSecret = process.env.FACEBOOK_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET || "";
  const redirectUri = getRedirectUri();
  return { clientId, clientSecret, redirectUri };
}

export function generateInstagramAuthUrl(scopes?: string[]) {
  const { clientId, redirectUri } = getClient();
  if (!clientId) throw new Error("Facebook client id is not configured (FACEBOOK_APP_ID)");
  const scopeList = scopes?.length ? scopes : (process.env.FACEBOOK_SCOPES || "email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement").split(/[ ,]+/).filter(Boolean);
  const scopeParam = scopeList.join(",");
  const state = Math.random().toString(36).slice(2);
  const url =
    `https://www.facebook.com/v16.0/dialog/oauth` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&scope=${encodeURIComponent(scopeParam)}` +
    `&response_type=code`;
  return { url, state };
}

export async function exchangeInstagramCodeForTokens(code: string) {
  const { clientId, clientSecret, redirectUri } = getClient();
  if (!clientId || !clientSecret) throw new Error("Facebook client id/secret not configured (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET)");
  const url = `https://graph.facebook.com/v16.0/oauth/access_token` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&client_secret=${encodeURIComponent(clientSecret)}` +
    `&code=${encodeURIComponent(code)}`;
  const res = await axios.get(url);
  return res.data; // { access_token, token_type, expires_in }
}

export async function exchangeShortLivedForLongLived(accessToken: string) {
  const { clientId, clientSecret } = getClient();
  const url = `https://graph.facebook.com/v16.0/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&client_secret=${encodeURIComponent(clientSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(accessToken)}`;
  const res = await axios.get(url);
  return res.data; // { access_token, token_type, expires_in }
}

export async function getPageAdminIgAccounts(accessToken: string) {
  const url = `https://graph.facebook.com/me?fields=id,name,email,accounts{id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}},businesses{id,name,picture{url},owned_pages{id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}}}`
  const res = await axios.get(url,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return res.data;
}

function splitAccountsAndBusinesses(response: any) {
  const accounts = response?.accounts?.data || [];
  const businesses = response?.businesses?.data || [];

  const businessPageIds = new Set<string>();

  businesses.forEach((business: any) => {
    const ownedPages = business.owned_pages?.data || [];
    ownedPages.forEach((page: any) => {
      if (page?.id) {
        businessPageIds.add(page.id);
      }
    });
  });

  return accounts.filter((account: any) => {
    const hasInstagramBusiness = !!account.instagram_business_account;
    const isInBusiness = businessPageIds.has(account.id);
    return hasInstagramBusiness && !isInBusiness;
  });
}


function buildBusinessAccounts(response: any) {
  const businesses = response?.businesses?.data || [];

  return businesses
    .filter((business: any) => {
      const pages = business.owned_pages?.data || [];
      return pages.some((page: any) => page.instagram_business_account);
    })
    .map((business: any) => {
      const pages = business.owned_pages?.data || [];

      const igAccounts = pages
        .filter((page: any) => page.instagram_business_account)
        .map((page: any) => ({
          id: page.instagram_business_account.id,
          username: page.instagram_business_account.username,
          name: page.instagram_business_account.name || null,
          profile_pic: page.instagram_business_account.profile_picture_url,
          followers_count: page.instagram_business_account.followers_count
        }));

      return {
        id: business.id,
        name: business.name,
        businessPic: business.picture?.data?.url || null,
        igAccounts
      };
    });
}

export async function getIgAccountsAndBusinesses(accessToken: string) {
  const url = `https://graph.facebook.com/me?fields=id,name,email,
    accounts{id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}},
    businesses{id,name,picture{url},owned_pages{id,name,category,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}}}`;

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const accounts = splitAccountsAndBusinesses(res.data);
  const businesses = buildBusinessAccounts(res.data);

  return {
    accounts,
    businesses
  };
}

export async function getAddedIgAccountDetails(accessToken: string, igAccounts: any[]) {
  const { accounts, businesses } = await getIgAccountsAndBusinesses(accessToken);
  const dbIgIds = new Set(igAccounts.map(acc => acc.instagramBusinessId || acc.id));

  const result: any[] = [];

  // 1️⃣ From direct Instagram accounts
  accounts.forEach((acc: any) => {
    const ig = acc.instagram_business_account;
    if (ig && dbIgIds.has(ig.id)) {
      result.push({
        id: ig.id,
        profilePic: ig.profile_picture_url,
        name: ig.name,
        username: ig.username,
        followersCount: ig.followers_count,
        accountType : 'Page Admin',
        assignedClient: igAccounts.find(db => db.instagramBusinessId === ig.id)?.assignedClientId || null
      });
    }
  });

  // 2️⃣ From Business Manager IG accounts
  businesses.forEach((business: any) => {
    business.igAccounts.forEach((ig: any) => {
      if (dbIgIds.has(ig.id)) {
        result.push({
          id: ig.id,
          profilePic: ig.profile_pic,
          name: ig.name,
          username: ig.username,
          followersCount: ig.followers_count || null,
          accountType : 'Bussiness Account',
          assignedClient: igAccounts.find(db => db.instagramBusinessId === ig.id)?.assignedClientId || null
        });
      }
    });
  });

  return result;
}

export async function getBusinessIgAccounts(accessToken: string) {
  const url = `https://graph.facebook.com/me?fields=id,name,emai,businesses{id,name,profile_picture_uri,owned_pages{instagram_business_account{id,username,profile_picture_url}}}`
  const res = await axios.get(url,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return res.data;
}

export async function getFacebookUser(accessToken: string) {
  const url = `https://graph.facebook.com/me?fields=id,name,email` + `&access_token=${encodeURIComponent(accessToken)}`;
  const res = await axios.get(url);
  return res.data;
}

