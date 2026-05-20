import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '../../../components/ChatScreen';

export default function AdminConversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <ChatScreen conversationId={id} />;
}
