/**
 * 易名符改名弹窗静态渲染测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定共享改名弹窗在伙伴场景可按需显示“描述”输入区，而角色场景保持只有名称输入。
 * 2. 做什么：复用静态渲染验证字段显隐，避免为了一个共享表单字段引入整套浏览器事件依赖。
 * 3. 不做什么：不验证提交交互、不发请求，也不覆盖头像上传流程。
 *
 * 输入/输出：
 * - 输入：角色改名 props、伙伴改名 props。
 * - 输出：`renderToStaticMarkup` 生成的 HTML 字符串。
 *
 * 数据流/状态流：
 * - rename flow 传入弹窗配置 -> CharacterRenameModal -> 静态 HTML。
 *
 * 关键边界条件与坑点：
 * 1. 描述字段只能在显式传入配置时出现，不能把角色改名也带出额外输入区。
 * 2. 伙伴描述输入区必须复用共享弹窗，而不是在伙伴页私自再拼一套表单。
 */
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';

import CharacterRenameModal from '../CharacterRenameModal';

describe('CharacterRenameModal', () => {
  it('未配置描述字段时不应渲染描述输入区', () => {
    const html = renderToStaticMarkup(
      <CharacterRenameModal
        open
        title="角色改名"
        itemName="易名符"
        description="消耗 1 张【易名符】后，立即将名称改为新的内容。"
        inputLabel="新道号"
        inputPlaceholder="请输入新的道号"
        submitText="确认改名"
        initialName="青玄"
        submitting={false}
        onCancel={() => undefined}
        onSubmit={async () => undefined}
      />,
    );

    expect(html).toContain('新道号');
    expect(html).not.toContain('伙伴描述');
    expect(html).not.toContain('请输入新的伙伴描述');
  });

  it('配置描述字段后应渲染描述输入区', () => {
    const props: ComponentProps<typeof CharacterRenameModal> & {
      descriptionFieldConfig: {
        label: string;
        placeholder: string;
        initialValue: string;
        maxLength: number;
      };
    } = {
      open: true,
      title: '伙伴改名',
      itemName: '易名符',
      description: '消耗 1 张【易名符】后，可同时修改伙伴名称与描述。',
      inputLabel: '新伙伴名',
      inputPlaceholder: '请输入新的伙伴名',
      submitText: '确认改名',
      initialName: '青萝',
      descriptionFieldConfig: {
        label: '伙伴描述',
        placeholder: '请输入新的伙伴描述',
        initialValue: '山中修行的木灵术修。',
        maxLength: 80,
      },
      submitting: false,
      onCancel: () => undefined,
      onSubmit: async () => undefined,
    };

    const html = renderToStaticMarkup(<CharacterRenameModal {...props} />);

    expect(html).toContain('新伙伴名');
    expect(html).toContain('伙伴描述');
    expect(html).toContain('请输入新的伙伴描述');
  });
});
