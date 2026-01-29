"use client";
import React, { useState } from 'react';
import { Form, Input, Button, Card, Layout, message, Typography } from 'antd';
import { UserOutlined, LockOutlined, DatabaseOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { ldapService } from '@/lib/api';

const { Content } = Layout;
const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      // 1. Call your backend login endpoint
      const response = await ldapService.login(values.username, values.password);

      if (!response.ok) throw new Error('Invalid credentials');

      const data = await response.json();
      
      // 2. Store the JWT Token
      localStorage.setItem('token', data.access_token);
      
      message.success('Welcome to LDAP Admin');
      router.push('/'); // Redirect to your main app
    } catch (error) {
      message.error('Authentication failed. Please check your LDAP credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Card style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <DatabaseOutlined style={{ fontSize: 40, color: '#1890ff' }} />
            <Title level={3} style={{ marginTop: 12 }}>LDAP</Title>
            <Text type="secondary">LDAP Directory Management</Text>
          </div>

          <Form name="login" onFinish={onFinish} layout="vertical" size="large">
            <Form.Item
              name="username"
              rules={[{ required: true, message: 'Please input your Admin UID!' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="Username (e.g. admin)" />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: 'Please input your Password!' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="Password" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>
                Sign In
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </Content>
    </Layout>
  );
}