"use client";
import React, { useState } from 'react';
import { Layout, Table, Input, Button, Tag, Space, Card, Statistic, Row, Col, Dropdown, Menu } from 'antd';
import { SearchOutlined, UserOutlined, SettingOutlined, LogoutOutlined } from '@ant-design/icons';

const { Header, Content, Sider } = Layout;

export default function AntDashboard() {
  const [loading, setLoading] = useState(false);

  const columns = [
    { title: 'UID', dataIndex: 'uid', key: 'uid', render: (text: string) => <a className="font-mono">{text}</a> },
    { title: 'Common Name', dataIndex: 'cn', key: 'cn' },
    { title: 'Email', dataIndex: 'mail', key: 'mail' },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'Active' ? 'green' : 'volcano'}>{status.toUpperCase()}</Tag>
      )
    },
    {
      title: 'Action',
      key: 'action',
      render: () => (
        <Space size="middle">
          <Button type="link">Edit</Button>
          <Dropdown menu={{ items: [{ key: '1', label: 'Disable User' }, { key: '2', label: 'Delete', danger: true }] }}>
            <Button type="text">More</Button>
          </Dropdown>
        </Space>
      ),
    },
  ];

  const data = [
    { key: '1', uid: 'whale_01', cn: 'Satoshi Nakamoto', mail: 'satoshi@btc.com', status: 'Active' },
    { key: '2', uid: 'dev_09', cn: 'Vitalik Buterin', mail: 'vitalik@eth.com', status: 'Active' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" breakpoint="lg" collapsedWidth="0">
        <div className="p-4 text-white font-bold text-center border-b border-gray-700 mb-4">
          CRYPTO LAKE
        </div>
        <Menu theme="dark" mode="inline" defaultSelectedKeys={['1']} items={[
          { key: '1', icon: <UserOutlined />, label: 'User Explorer' },
          { key: '2', icon: <SettingOutlined />, label: 'LDAP Config' },
          { key: '3', icon: <LogoutOutlined />, label: 'Logout' },
        ]} />
      </Sider>
      
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 className="text-lg font-semibold m-0">Directory Management</h2>
          <Space>
            <span className="text-gray-400">Next.js 16.1.5</span>
            <Button type="primary" shape="circle" icon={<UserOutlined />} />
          </Space>
        </Header>

        <Content style={{ margin: '24px' }}>
          <Row gutter={16} className="mb-6">
            <Col span={8}>
              <Card bordered={false} className="shadow-sm"><Statistic title="LDAP Entries" value={100000000} /></Card>
            </Col>
            <Col span={8}>
              <Card bordered={false} className="shadow-sm"><Statistic title="SSL Status" value="Encrypted" valueStyle={{ color: '#3f8600' }} /></Card>
            </Col>
          </Row>

          <Card className="shadow-sm">
            <div className="mb-4 flex gap-2">
              <Input 
                size="large" 
                placeholder="Search UID or Wallet..." 
                prefix={<SearchOutlined />} 
                className="max-w-md"
              />
              <Button type="primary" size="large" loading={loading} onClick={() => setLoading(true)}>
                Execute Query
              </Button>
            </div>
            
            <Table columns={columns} dataSource={data} pagination={{ pageSize: 10 }} />
          </Card>
        </Content>
      </Layout>
    </Layout>
  );
}