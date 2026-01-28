"use client";
import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Button, Modal, Form, Input, Space, Popconfirm } from 'antd';
import { ldapService } from '@/lib/api';

interface LDAPUser {
  dn: string;
  uid: string;
  cn: string;
  mail: string;
  title: string | null;
}

export default function Dashboard() {
  const [data, setData] = useState<LDAPUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  // 1. Load Data using our service
  const loadUsers = async () => {
    setLoading(true);
    try {
      const result = await ldapService.getUsers();
      setData(result.results);
    } catch (error) {
      message.error("Failed to fetch users from Crypto Lake");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // 2. Handle Create User
  const handleCreate = async (values: any) => {
    try {
      // Mapping form values to LDAP attributes
      const payload = {
        sn: values.sn,
        cn: values.cn,
        mail: values.mail,
        title: values.title,
        userPassword: values.password
      };
      
      await ldapService.createUser(values.uid, payload);
      message.success(`User ${values.uid} created successfully`);
      setIsModalOpen(false);
      form.resetFields();
      loadUsers(); // Refresh table
    } catch (error) {
      message.error("Creation failed");
    }
  };

  // 3. Handle Delete User
  const handleDelete = async (dn: string) => {
    try {
      await ldapService.deleteResource(dn);
      message.success("User purged from directory");
      loadUsers(); // Refresh table
    } catch (error) {
      message.error("Purge failed");
    }
  };

  const columns = [
    { title: 'Username (UID)', dataIndex: 'uid', key: 'uid', width: '15%' },
    { title: 'Full Name', dataIndex: 'cn', key: 'cn', width: '25%' },
    { title: 'Email', dataIndex: 'mail', key: 'mail', width: '25%' },
    { 
      title: 'Role', 
      dataIndex: 'title', 
      key: 'title',
      render: (text: string) => <Tag color={text ? "blue" : "default"}>{text || 'Member'}</Tag>
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: LDAPUser) => (
        <Space size="middle">
          <Button type="link">Edit</Button>
          <Popconfirm
            title="Delete user"
            description="Are you sure you want to remove this user?"
            onConfirm={() => handleDelete(record.dn)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" danger>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1>LDAP User Management</h1>
        <Button type="primary" onClick={() => setIsModalOpen(true)}>
          + Add User
        </Button>
      </div>

      <Table 
        columns={columns} 
        dataSource={data} 
        rowKey="dn" 
        loading={loading}
        locale={{ emptyText: loading ? " " : "No Users Found" }}
        pagination={{ pageSize: 10 }}
      />

      {/* CREATE USER MODAL */}
      <Modal 
        title="Create New LDAP User" 
        open={isModalOpen} 
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="uid" label="Username" rules={[{ required: true }]}>
            <Input placeholder="e.g. satoshi" />
          </Form.Item>
          <Form.Item name="cn" label="Full Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Satoshi Nakamoto" />
          </Form.Item>
          <Form.Item name="sn" label="Surname" rules={[{ required: true }]}>
            <Input placeholder="e.g. Nakamoto" />
          </Form.Item>
          <Form.Item name="mail" label="Email" rules={[{ type: 'email' }]}>
            <Input placeholder="e.g. satoshi@btc.com" />
          </Form.Item>
          <Form.Item name="title" label="Title">
            <Input placeholder="e.g. Lead Architect" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}