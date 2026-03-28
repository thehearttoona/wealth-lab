import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../utils/constants';
import { AIMessage, AIFinancialContext } from '../types';
import { buildFinancialContext, sendAIMessage, getBackendUrl } from '../services/aiService';

const SUGGESTIONS = [
  'วิเคราะห์รายจ่ายเดือนนี้',
  'พอร์ตโฟลิโอเป็นอย่างไร?',
  'สรุปการเทรด',
];

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ])
      ).start();

    animate(dot1, 0);
    animate(dot2, 200);
    animate(dot3, 400);
  }, [dot1, dot2, dot3]);

  const dotStyle = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
  });

  return (
    <View style={styles.typingContainer}>
      <View style={styles.typingBubble}>
        <Animated.View style={[styles.dot, dotStyle(dot1)]} />
        <Animated.View style={[styles.dot, dotStyle(dot2)]} />
        <Animated.View style={[styles.dot, dotStyle(dot3)]} />
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: AIMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAI]}>
      {!isUser && (
        <View style={styles.aiAvatar}>
          <Ionicons name="hardware-chip-outline" size={14} color={COLORS.primary} />
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAI]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

interface AIAssistantProps {
  fabBottom?: number;
}

export default function AIAssistant({ fabBottom = 90 }: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [context, setContext] = useState<AIFinancialContext | null>(null);
  const [backendUrl, setBackendUrl] = useState('http://localhost:8000');

  const flatListRef = useRef<FlatList>(null);
  const fabScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(fabScale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
  }, [fabScale]);

  const handleOpen = useCallback(async () => {
    setIsOpen(true);
    if (context === null) {
      setIsLoadingContext(true);
      try {
        const [ctx, url] = await Promise.all([buildFinancialContext(), getBackendUrl()]);
        setContext(ctx);
        setBackendUrl(url);
      } catch {
        setContext({});
      } finally {
        setIsLoadingContext(false);
      }
    }
  }, [context]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMsg: AIMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputText('');
      setIsLoading(true);

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

      try {
        const responseText = await sendAIMessage(trimmed, messages, context ?? {}, backendUrl);
        const aiMsg: AIMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: responseText,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      } catch {
        const errMsg: AIMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'ขออภัย ไม่สามารถเชื่อมต่อกับ AI ได้ กรุณาตรวจสอบการตั้งค่า backend',
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsLoading(false);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    },
    [isLoading, messages, context, backendUrl]
  );

  return (
    <>
      {/* Floating Action Button */}
      <Animated.View style={[styles.fab, { bottom: fabBottom, transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity style={styles.fabButton} onPress={handleOpen} activeOpacity={0.85}>
          <Ionicons name="hardware-chip-outline" size={26} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      {/* Chat Modal */}
      <Modal visible={isOpen} animationType="slide" transparent statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.chatContainer}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Ionicons name="hardware-chip-outline" size={20} color={COLORS.primary} />
                <Text style={styles.headerTitle}>Narix AI</Text>
              </View>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <MessageBubble message={item} />}
              contentContainerStyle={styles.messageList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              ListEmptyComponent={
                isLoadingContext ? (
                  <View style={styles.emptyState}>
                    <ActivityIndicator color={COLORS.primary} />
                    <Text style={styles.emptyText}>กำลังโหลดข้อมูล...</Text>
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="hardware-chip-outline" size={40} color={COLORS.primary} style={{ opacity: 0.6 }} />
                    <Text style={styles.emptyTitle}>สวัสดี! ฉันคือ Narix AI</Text>
                    <Text style={styles.emptyText}>ถามเรื่องการเงินของคุณได้เลย</Text>
                    <View style={styles.suggestions}>
                      {SUGGESTIONS.map((s) => (
                        <TouchableOpacity
                          key={s}
                          style={styles.suggestionChip}
                          onPress={() => handleSend(s)}
                        >
                          <Text style={styles.suggestionText}>{s}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )
              }
              ListFooterComponent={isLoading ? <TypingIndicator /> : null}
            />

            {/* Input */}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={inputText}
                onChangeText={setInputText}
                placeholder="พิมพ์ข้อความ..."
                placeholderTextColor={COLORS.textSecondary}
                multiline
                maxLength={500}
                onSubmitEditing={() => handleSend(inputText)}
                returnKeyType="send"
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
                onPress={() => handleSend(inputText)}
                disabled={!inputText.trim() || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    zIndex: 999,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  chatContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '75%',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: 'NotoSansThai_400Regular',
  },
  messageList: {
    padding: 12,
    flexGrow: 1,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 4,
    alignItems: 'flex-end',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAI: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${COLORS.primary}22`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    marginBottom: 2,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'NotoSansThai_400Regular',
  },
  bubbleTextUser: {
    color: '#fff',
  },
  bubbleTextAI: {
    color: COLORS.text,
  },
  typingContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: 'NotoSansThai_400Regular',
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: 'NotoSansThai_400Regular',
    textAlign: 'center',
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  suggestionChip: {
    backgroundColor: `${COLORS.primary}18`,
    borderWidth: 1,
    borderColor: `${COLORS.primary}44`,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  suggestionText: {
    color: COLORS.primary,
    fontSize: 13,
    fontFamily: 'NotoSansThai_400Regular',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: 100,
    fontFamily: 'NotoSansThai_400Regular',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
