# 申请 Amazon 接口 · 超简单版

> 这份文档给你一步一步做。
> 每一行 = 做一件事。
> 做完一行，打个勾 ✅，再做下一行。
> 不用懂技术词。看不懂的词，文档最后有解释。

---

## 先看这里（最重要的 3 句话）

1. 这件事**急**。Amazon 审核要**几周到几个月**。今天就开始。
2. 一共要申请 **2 个东西**：A = 卖货数据接口（SP-API），B = 广告接口（Ads API）。
3. 你需要准备好这 4 样（先放手边）：
   - 你的 **Amazon 卖家账号**（要专业版 Professional，不是个人版）
   - 你的 **公司名字**
   - 你的 **网站地址**（没有也能先填店铺链接，但建议有）
   - 一个 **隐私政策网页**（一段话说明你怎么用数据，放到网上）

---

## 你要复制的 3 个地址（先存好，后面要粘贴）

> 这些是我们系统的地址。Amazon 会问你"用户授权后跳到哪里"，你就填这些。
> 已经帮你配好 HTTPS，地址用下面这个域名。

**地址 1 — 登录地址（Login URI）：**
```
https://amz.cloudcut.fun/api/v1/integrations/oauth/spapi/login
```

**地址 2 — SP-API 回调地址（Redirect URI）：**
```
https://amz.cloudcut.fun/api/v1/integrations/oauth/spapi/callback
```

**地址 3 — 广告回调地址（Ads Redirect URI）：**
```
https://amz.cloudcut.fun/api/v1/integrations/oauth/ads/callback
```

> ⚠️ 注意：要先在你的域名后台，把 `amz.cloudcut.fun` 指向服务器 `47.97.252.71`（加一条 A 记录）。
> 这一步不做，上面 3 个地址打不开，Amazon 审核会失败。
> 加好后，在浏览器打开地址 1，能出现页面（不是报错），就说明 OK。

---

# 第一部分：申请 A（卖货数据接口 SP-API）

> 这个让系统能读你的订单、库存、结算。先做这个。

## A-1　开通开发者资格

✅ 第 1 步：电脑打开 Amazon 卖家后台（Seller Central）。

✅ 第 2 步：顶部菜单找 **Apps and Services**（应用和服务）。

✅ 第 3 步：点里面的 **Develop Apps**（开发应用）。

✅ 第 4 步：第一次会让你填一个**开发者资料**（Developer Profile）。点 **Proceed**（继续）进去。

## A-2　填开发者资料

✅ 第 5 步：填 **公司名字**。

✅ 第 6 步：填 **网站地址**。

✅ 第 7 步：填 **联系人**（你的名字 + 邮箱）。

✅ 第 8 步：遇到问"你要哪种"，选这个：
> **Public Developer**（公开开发者）
> 它的意思是"我做一个工具给卖家用"。
> （如果你只想自己一个店用，也可以选 Private / 私有，更快，不用审网站。拿不准就选 Public。）

✅ 第 9 步：会问你"要哪些权限/角色"（Roles）。勾这些就够：
- Orders（订单）
- Inventory（库存）
- Finance / Settlement（财务/结算）
- Product Listing（商品）

✅ 第 10 步：会有一栏让你写"你怎么用这些数据"。
> 写一句话就行，比如：
> "用于卖家自己的利润分析和库存管理，数据不对外分享。"
> （不要超过 500 字。越简单越好。）

✅ 第 11 步：点 **提交 / Submit**。
> 提交后 Amazon 会审核。**这里就要等了**（几周）。可以先做下面的步骤。

## A-3　建应用，拿钥匙

✅ 第 12 步：回到 **Develop Apps** 页面。

✅ 第 13 步：左下角点 **Add new app client**（新建应用）。

✅ 第 14 步：填 **应用名字**（随便起，比如 `amz-operator`）。

✅ 第 15 步：**API type**（接口类型）选 **SP-API**。

✅ 第 16 步：填 **Login URI**（登录地址）= 上面的**地址 1**。

✅ 第 17 步：填 **Redirect URI**（回调地址）= 上面的**地址 2**。

✅ 第 18 步：点 **Save and exit**（保存退出）。
> 现在应用是"草稿（draft）"状态。正常的。

✅ 第 19 步：在应用列表里，点 **查看凭证 / View credentials**。
> 你会看到两串东西，**复制下来发给我**（或存好）：
> - **Client ID**（客户端 ID，像 `amzn1.application-oa2-client.xxxx`）
> - **Client Secret**（客户端密钥，一长串）

> ⚠️ Client Secret 只显示一次，没存到就要重置。**一定要存好。**

---

# 第二部分：申请 B（广告接口 Ads API）

> 这个让系统能读/管你的广告。它要在**另外两个网站**操作。稍微绕，跟着做。

## B-1　建一个"安全档案"（在 developer.amazon.com）

✅ 第 20 步：电脑打开网站 **developer.amazon.com**，用你的 Amazon 账号登录。

✅ 第 21 步：顶部找 **Login with Amazon**（用亚马逊登录），点进去。

✅ 第 22 步：点 **Create a New Security Profile**（新建安全档案）。

✅ 第 23 步：填 3 样：
- **Security Profile Name**（档案名字）：随便起，比如 `amz-operator`
- **Description**（描述）：随便写一句，比如 `seller ads tool`
- **Consent Privacy Notice URL**（隐私政策网址）：填你那个隐私政策网页地址

✅ 第 24 步：保存。

✅ 第 25 步：在档案列表里，点 **Show Client ID and Client Secret**（显示 ID 和密钥）。
> 又有两串，**复制存好**（这是广告的，跟上面 SP-API 的不一样）：
> - **Client ID**
> - **Client Secret**

✅ 第 26 步：在 **General**（常规）页，找到 **Security Profile ID**，也存一下。

✅ 第 27 步：找 **Manage**（管理）→ **Web Settings**（网页设置）。
> 在 **Allowed Return URLs**（允许的返回地址）里，填上面的**地址 3**。保存。

## B-2　申请广告接口权限（在 Ads Partner Network Console）

✅ 第 28 步：电脑打开 **Amazon Ads Partner Network Console**。
> 搜索 "Amazon Ads Partner Network Console" 就能找到。
> 用**同一个邮箱**登录（很重要，必须同一个）。

✅ 第 29 步：左边菜单点 **API Applications**（API 应用）。

✅ 第 30 步：点 **Request API Access**（申请接口权限）。

✅ 第 31 步：选类型：
> 如果是你自己的店 → 选 **Direct Advertiser**（直接广告主）
> 如果是帮别人管 → 选 **Tool Provider / Agency**（工具方/代理）
> 你的情况一般选 **Direct Advertiser**。

✅ 第 32 步：勾上 **advertising campaigns**（广告活动）这个权限。

✅ 第 33 步：填"业务说明"（为什么要用）。
> 写一句：`用于卖家自己的广告优化与报表分析。`

✅ 第 34 步：提交。**又要等审核了**（几周）。

## B-3　把两个网站"连起来"（关键！很多人卡这）

✅ 第 35 步：审核通过后，你会收到一封**批准邮件**。

✅ 第 36 步：点邮件里的**链接**。

✅ 第 37 步：它会让你选一个"安全档案"。
> 选你在**第 22 步**建的那个（`amz-operator`）。

✅ 第 38 步：点 **Link application**（关联应用）。
> ⚠️ 这一步**不能跳过**。不连，广告接口用不了。

✅ 完成后会显示一句确认，里面有 `advertising::campaign_management`。看到就对了。

---

# 第三部分：填进系统

> 等 A 和 B 都批准、钥匙都拿到后，把它们填进系统。
> 这步**发给我，我来填**（填到服务器的 .env 文件里，你不用碰）。

你要给我这些（A 和 B 各一套）：

**A（SP-API）：**
- Client ID
- Client Secret

**B（Ads）：**
- Client ID
- Client Secret
- Security Profile ID

> 还有一个加密钥匙（CREDENTIAL_ENC_KEY），我会自己生成，你不用管。
> Profile ID（广告档案 ID）是授权后系统自动拿的，你也不用管。

填好后，你在系统里点"授权"，跳到 Amazon 登录，点同意，就接通了。
**接通前，系统不会动你任何真实数据/真实广告**——这是安全设计。

---

# 卡住了？对照这张表

| 情况 | 怎么办 |
|---|---|
| 地址打不开 / Amazon 说 redirect 无效 | DNS 没指好。先把 `amz.cloudcut.fun` 指向 `47.97.252.71`。 |
| 提交后没反应 | 正常，在审核。几周。别重复提交。 |
| 个人账号不能建应用 | 卖家账号要升级成 **专业版（Professional）**。 |
| Client Secret 没看到/丢了 | 在应用里点 **重置（Reset）**，重新生成。 |
| 广告接口报"没权限/scope" | 八成是**第 38 步没点 Link**。回去点。 |
| 两个网站对不上 | 检查是不是**用了同一个邮箱**登录。必须同一个。 |

---

# 词语解释（看不懂时翻这里）

- **SP-API**：卖货数据接口。读订单、库存、结算的。
- **Ads API**：广告接口。读和管广告的。
- **LWA / Login with Amazon**：亚马逊的登录系统。给接口发钥匙的地方。
- **Client ID / Client Secret**：一对"钥匙"。系统拿它去跟 Amazon 要数据。Secret 要保密。
- **Security Profile**：广告这边的"身份档案"。装钥匙的盒子。
- **Redirect URI / Login URI**：用户授权后，Amazon 把人送回来的地址。就是我们系统的地址。
- **Profile ID**：你的广告账户编号。授权后系统自动拿。
- **草稿 / draft**：应用刚建好、还没正式发布的状态。能用来测试。
- **DNS / A 记录**：把域名（amz.cloudcut.fun）跟服务器（47.97.252.71）对上的设置。在你买域名的网站后台改。

---

# 今天就做的 3 件事（其他都能等）

1. 把 `amz.cloudcut.fun` 在域名后台指向 `47.97.252.71`（5 分钟）。
2. 做**第一部分 A-1 和 A-2**（开通开发者 + 提交资料）→ 让它先开始审核。
3. 做**第二部分 B-2 第 28~34 步**（申请广告权限）→ 也让它先开始审核。

> 两个审核**同时排队**，省时间。
> 审核期间，A-3 和 B-1 的"拿钥匙"步骤可以慢慢做。

---

来源（官方与权威）：
- [Amazon SP-API 注册总览](https://developer-docs.amazon.com/sp-api/docs/sp-api-registration-overview)
- [注册公开开发者](https://developer-docs.amazon.com/sp-api/docs/register-as-a-public-developer)
- [注册你的应用](https://developer-docs.amazon.com/sp-api/docs/registering-your-application)
- [Amazon Ads API onboarding 总览](https://advertising.amazon.com/API/docs/en-us/guides/onboarding/overview)
- [如何拿 Amazon Ads API 钥匙（步骤版）](https://unified.to/blog/how_to_get_your_amazon_ads_api_key)
