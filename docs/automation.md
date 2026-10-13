# Profile README 自动更新

## 部署到个人主页

1. 个人资料仓库必须是公开的，并且仓库名与 GitHub 用户名一致。
   当前仓库已从 `luskyle/readme` 重命名为 **`luskyle/luskyle`**，符合个人主页展示要求。
   本地 Git remote 使用 `https://github.com/luskyle/luskyle.git`。
   将此项目用于其他账号时，请放入与该账号同名的公开仓库。
2. 将本项目文件提交并推送到默认分支（当前为 `main`）。
3. 在 Settings → Actions → General 中允许 Actions 运行。如果组织或仓库策略
   禁止 `contents: write`，需要管理员允许工作流写入内容。默认分支的保护规则
   也必须允许该工作流提交；不要为了此功能关闭其他必要的保护措施。
4. 在 Actions → Update Profile README → Run workflow 中执行一次，检查日志。

工作流使用仓库自带的 `GITHUB_TOKEN`，只读取公开数据，不需要配置个人访问令牌。
自动提交只包含根目录的 `README.md` 和 `assets/` 中的生成图片；
README 文档更新时间也会在每次成功更新时自动写入（UTC 日期）。相同数据且日期未变化时
不会产生新提交。全部图片由本地 SVG 生成器绘制，不调用第三方统计图片服务。
本地生成一次 README 不会启动云端定时任务，必须先将工作流推送到 GitHub。

## 展示内容

- 概览：公开仓库数、Followers、Following、全部公开原创仓库的 Star 总数
  （包括归档仓库，不包括 Fork）。
- 热门仓库：最多 6 个非 Fork、未归档的公开仓库，按 Star 数降序排列；
  同分时按最近更新时间排序。
- 最近活动：从 GitHub 返回的最近 100 条公开事件中按时间倒序展示最多 5 条受支持的事件，
  包括 Push、PR、Issue、评论、Release、Star、Fork 和创建事件。
  Events API 有延迟及时间/数量限制，不等同于完整贡献历史或实时动态。
- 精选项目：默认读取 GitHub 主页的公开置顶仓库，按置顶顺序展示最多 6 个，
  自动更新简介、主要语言、Star 和 Fork 数。保留置顶的 Fork、归档仓库和其他所有者的仓库；
  不套用热门仓库的筛选规则。不读取置顶 Gist。
- 最近维护：最多 3 个未归档的公开原创仓库，按 `pushed_at`（最近推送时间）排序。
- 最新发布：检查所有公开原创仓库各自最近 5 条 Release，排除草稿、预发布，
  合并后展示最新 5 条正式发布。不是全部版本历史。
- 开源贡献：搜索作者为当前账号的公开 PR，按更新时间展示最多 5 条，含合并状态。
  既包括自己的仓库，也包括对他人项目的贡献。
- 文章：可选 RSS 2.0 / Atom 源，按日期展示最多 5 篇，按链接去重。
  未配置源时明确展示待配置，而不是虚构文章。支持 HTTPS 源，不允许 DTD / 实体声明。
- 个人方向、正在做和正在学：通过配置填写；没有填写的内容明确标注待补充。
- 联系方式：展示 GitHub 主页，以及 GitHub 资料中已经公开的邮箱和 HTTP(S) 网站。
  如不希望展示邮箱，可从个人 GitHub 资料中移除公开邮箱或调整联系方式渲染函数。

## 统计图与动画

`assets/` 内的 SVG 随脚本运行更新，包含：

| 文件 | 内容与统计口径 |
| --- | --- |
| `banner.svg` | 深色渐变与网格横幅、两行英文诗句，以及开源、系统工程、自动化与长期构建标签 |
| `stats.svg` | 公开仓库数、关注数和公开原创仓库 Star 总数 |
| `commits.svg` | GitHub GraphQL 返回的过去一年默认分支提交数，按周汇总并绘制折线 |
| `snake.svg` | 过去一年贡献记录的动画，标出覆盖日期范围，沿最后 40 个活跃日期移动 |

连续记录按 GitHub 贡献数据中的连续非零日期计算；当前日期尚无贡献时，
允许连续记录截至昨天。最长记录只计算本次数据范围，不是账号历史最长记录。
图表包含 SVG 标题、描述，贡献蛇图中会显示日期范围。
不支持 SVG 动画的客户端会显示静态图片。图表文字采用英文以减少字体兼容问题，
README 中提供中文说明。

贡献蛇动画和每周提交图需要 `GITHUB_TOKEN`。工作流自动提供；本地未提供时明确提示
无法生成，不用公开活动样本伪装提交数据。每周提交数来自 GitHub 贡献图中的默认分支
提交统计，不包括非默认分支，也不等同于 Issue、PR 等其他贡献类型。
配置 Token 后再运行即可生成。
GraphQL、Release、RSS 请求失败时都会报错，全部网络数据准备完成之前不写文件。

## 配置与标记

### 贡献数与个人主页不一致

贡献蛇读取 GitHub GraphQL `contributionCalendar`，不使用 Events API 估算，
也不把其他统计数字补进日历。
Token 能读取的范围可能与账号本人登录后看到的主页不同；默认仓库
`GITHUB_TOKEN` 不能读取其他私有仓库。

若希望包含私有贡献：

1. 检查 GitHub 个人主页的 Contribution settings → Private contributions 设置。
   开启后会公开匿名贡献数量，但不会公开私有仓库名称。
2. 必要时创建能读取相关仓库贡献的 Token，使用满足需求的最小权限；
   精细粒度 Token 的仓库范围、组织审批与 SSO 授权也会影响可见性。
3. 在此仓库 Settings → Secrets and variables → Actions 中添加
   **Secret** `CONTRIBUTIONS_TOKEN`。不要放入 Variables、源码或 README。
4. 手动运行工作流，比较同一时间范围的主页与日历结果。

此 Token 仅用于 GraphQL 贡献查询；公开项目请求和提交仍使用自带 `GITHUB_TOKEN`。
未设置时回退到自带 Token；已设置但请求失败时会报错，不偷偷回退。
本地运行同样可以通过 `CONTRIBUTIONS_TOKEN` 环境变量提供。
API 可见性、时间范围和数据刷新延迟仍可能造成差异，配置 Token 不保证与任何
登录视图完全一致。蛇动画默认直接展示，不使用折叠区。

编辑根目录 `profile.config.json`：

- `featuredSource`：默认 `pinned`，通过 GraphQL 跟随主页 Customize your pins 设置。
  调整置顶后，下次定时更新或手动运行会同步到 README，无需修改配置。
  没有公开置顶仓库时明确显示暂无，不回退到热门或旧名单。
  此查询使用 `GITHUB_TOKEN`（工作流自带），不使用专门的贡献 Token；
  本地需要设置 `GITHUB_TOKEN`，缺少 Token 或 API 请求失败时会报错并保留已有内容。
- `featuredRepositories`：仅在 `featuredSource` 为 `manual` 时使用的仓库名称数组。
  配置中的仓库必须是当前账号可读取的公开仓库；不存在时脚本报错。
  为兼容旧配置，未填写 `featuredSource` 时仍按手动名单展示。
- `rssFeeds`：博客 RSS / Atom 的 HTTPS 地址数组，默认空数组。
- `focus`、`workingOn`、`learning`：个人关注方向、正在做和正在学的文字。

切换账号时请调整静态介绍；置顶模式自动读取新账号的置顶列表，
手动模式需同步调整精选名单。
不要把私人邮箱、令牌或其他秘密写入公开配置文件。

可自由编辑 README 标记区域外的内容。以下标记必须各自唯一、起止顺序正确：

```html
<!-- PROFILE:START -->
<!-- PROFILE:END -->
<!-- REPOSITORIES:START -->
<!-- REPOSITORIES:END -->
<!-- FEATURED:START -->
<!-- FEATURED:END -->
<!-- RECENT:START -->
<!-- RECENT:END -->
<!-- RELEASES:START -->
<!-- RELEASES:END -->
<!-- BLOG:START -->
<!-- BLOG:END -->
<!-- CONTRIBUTIONS:START -->
<!-- CONTRIBUTIONS:END -->
<!-- COMMITS:START -->
<!-- COMMITS:END -->
<!-- ABOUT:START -->
<!-- ABOUT:END -->
<!-- CONTACT:START -->
<!-- CONTACT:END -->
<!-- DOCUMENT_UPDATED:START -->
<!-- DOCUMENT_UPDATED:END -->
```

区域内手动写入的内容会在下一次更新时被替换。API 请求失败或标记错误时，
脚本会报错并保留原 README，不会用空白内容覆盖已有数据。

## 更新频率与自定义

Cron 为 `17 */6 * * *`（UTC），约在北京时间每天 02:17、08:17、14:17、
20:17 运行。GitHub 调度可能延迟；定时任务仅运行默认分支中的工作流。
公开仓库长时间没有活动时，GitHub 可能暂停定时工作流，需要在 Actions 中重新启用。
手动触发工作流和首次推送相关文件也会执行更新。

默认读取仓库所有者的公开资料。要展示其他账号，可修改工作流更新步骤中的
`PROFILE_USERNAME` 环境变量，将其设为目标 GitHub 用户名。
这个变量只改变动态数据，不会自动修改静态介绍和主页链接。
若默认分支不再是 `main`，同步修改工作流的 `push.branches`；
定时和手动更新始终提交到仓库默认分支。

## 本地运行与测试

需要 Node.js 24。唯一直接依赖 `fast-xml-parser` 用于安全校验及解析 RSS / Atom：

```sh
npm ci
npm test
PROFILE_USERNAME=luskyle npm run update
```

可通过环境变量 `GITHUB_TOKEN` 提高本地 GitHub API 限额并启用贡献图表。
不要把 Token 写入代码或提交到仓库。未提供 Token 时使用匿名公开 API，
受到较低的请求限额约束。只有全部请求成功后才会写入 README。
